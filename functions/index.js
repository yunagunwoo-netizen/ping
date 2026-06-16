// 핑 FCM 푸시 발송용 Cloud Functions (Firestore 트리거 + 스케줄)
// 배포: 핑 폴더에서  firebase deploy --only functions
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const APP_URL = "https://www.ping.ai.kr/app.html";
const ICON = "https://www.ping.ai.kr/dubi-push.png"; // 알림에 뜨는 뚜비 아이콘
const FAMILY_ID = "kimfamily";
const MEMBER_IDS = ["아빠", "엄마", "윤아", "건우"];
const STREAK_TIERS = [{days: 3, pt: 15}, {days: 7, pt: 40}, {days: 14, pt: 80}, {days: 30, pt: 150}];

// 푸시 메시지 공통 옵션(뚜비 아이콘 포함)
function pushMsg(token, title, body) {
  return {
    token,
    notification: {title, body},
    data: {icon: ICON},
    webpush: {notification: {icon: ICON, badge: ICON}, fcmOptions: {link: APP_URL}},
  };
}

async function getTokensExcept(exceptMemberId) {
  const snap = await db.collection("fcmTokens").get();
  const tokens = [];
  snap.forEach((d) => {
    const t = d.data().token;
    if (d.id !== exceptMemberId && t) tokens.push(t);
  });
  return tokens;
}

// 핑이 올라오면 → 나머지 가족에게 푸시
exports.onPing = onDocumentCreated("pings/{pingId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  const member = data.memberId || "가족";
  const tokens = await getTokensExcept(member);
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({
    tokens,
    notification: {title: "핑 도착 📸", body: `${member}님이 오늘의 핑을 올렸어요!`},
    data: {icon: ICON},
    webpush: {notification: {icon: ICON, badge: ICON}, fcmOptions: {link: APP_URL}},
  });
});

// 찌르기(콕) → 대상 가족에게 푸시
exports.onPoke = onDocumentCreated("pokes/{pokeId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  const target = data.target;
  const from = data.from || "가족";
  if (!target) return;
  const tokenDoc = await db.doc(`fcmTokens/${target}`).get();
  const token = tokenDoc.exists ? tokenDoc.data().token : null;
  if (!token) return;
  await getMessaging().send(pushMsg(token, "👈 콕!", `${from}님이 콕 찔렀어요. 오늘 핑 보내세요 📸`));
});

// ===== 뚜비 코칭 푸시 =====
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const off = (d.getUTCDay() + 6) % 7; // 월요일 시작
  d.setUTCDate(d.getUTCDate() - off);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// 멤버별 연속/잠수 계산
function streakOf(dateSet, todayStr) {
  const pingedToday = dateSet.has(todayStr);
  const start = pingedToday ? todayStr : (dateSet.has(addDays(todayStr, -1)) ? addDays(todayStr, -1) : null);
  let alive = 0;
  if (start) { let cur = start; while (dateSet.has(cur)) { alive++; cur = addDays(cur, -1); } }
  const afterToday = pingedToday ? alive : alive + 1;
  let tier = null;
  for (const t of STREAK_TIERS) { if (t.days >= afterToday) { tier = t; break; } }
  const daysMore = tier ? tier.days - afterToday : null;
  let dormant = 99;
  if (dateSet.size) {
    let maxD = null;
    dateSet.forEach((d) => { if (!maxD || d > maxD) maxD = d; });
    dormant = Math.round((Date.parse(todayStr) - Date.parse(maxD)) / 86400000);
  }
  return {pingedToday, alive, tier, daysMore, dormant};
}

// 상황 → 알림 1건({title, body}) 또는 null. 앱 팝업(computeCoachTip)과 동일 우선순위.
function buildCoach(c) {
  const {pingedToday, alive, tier, daysMore, dormant, walked, gathered, total, cycleDays, hasFam} = c;
  // 연속 마일스톤 임박
  if (tier && daysMore !== null && daysMore <= 1) {
    if (!pingedToday) return {title: `🔥 ${tier.days}일 보너스가 코앞!`, body: `오늘 핑하면 연속 ${tier.days}일 보너스 +${tier.pt}점이 코앞이에요. 뚜비가 응원해요 🐾`};
    return {title: "🔥 연속 달리는 중!", body: `${daysMore === 0 ? "오늘이면" : `${daysMore}일만 더 핑하면`} ${tier.days}일 보너스 +${tier.pt}점! 조금만 더 힘내요 🐾`};
  }
  // 3일 이상 잠수
  if (dormant >= 3) return pick([
    {title: "뚜비가 보고 싶대요 🐶", body: `벌써 ${dormant}일째 사진이 없어요. 오랜만에 뚜비랑 한 컷 어때요?`},
    {title: "뚜비 행복도가 떨어지고 있어요 🥺", body: `${dormant}일 동안 조용했어요. 오늘 다시 핑으로 뚜비를 웃게 해줘요!`},
  ]);
  // 연속핑 끊길 위기
  if (!pingedToday && alive >= 2) return pick([
    {title: "뚜비가 현관에서 기다려요 🐾", body: `오늘 안 찍으면 ${alive}일 연속이 0이 돼요… 한 장만! 🥺`},
    {title: `앗, ${alive}일 연속이 위험해요!`, body: "지금 핑하면 기록이 쭉 이어져요. 뚜비가 꼬리 흔들며 응원 중이에요 🐶"},
  ]);
  // 미용주기 너무 길어짐
  if (hasFam && cycleDays >= 60 && total < 4200) return pick([
    {title: "뚜비 털이 점점 길어져요 ✂️", body: `미용한 지 벌써 ${cycleDays}일째… 4200점 같이 모아 뚜비 미용 보내줘요!`},
    {title: "뚜비가 앞이 잘 안 보인대요 🙈", body: "눈을 덮은 털, 이제 정리할 때! 가족이 핑 모으면 뚜비가 시원해져요."},
  ]);
  // 애견카페 한 달 이상
  if (hasFam && cycleDays >= 30 && total < 2700) return pick([
    {title: "뚜비가 카페 가고 싶대요 ☕", body: "애견카페 다녀온 지 한 달이 넘었어요. 2700점 모아 나들이 가요!"},
    {title: "별똥구리·카페댕스가 뚜비를 기다려요 🐶", body: "같이 핑 모아서 뚜비 카페 데이트 어때요? 잔디밭이 부르고 있어요!"},
  ]);
  // 산책 — 이번 주 산책 사진 아직
  if (!walked) return pick([
    {title: "이번 주 뚜비 산책 사진 아직이에요 🚶", body: "산책하며 한 장 찍으면 가족 전체 +50점! 뚜비가 리드줄 물고 왔어요 🐾"},
    {title: "날씨 좋은데 뚜비랑 산책? ☀️", body: "뚜비가 창밖만 보고 있어요. 산책하며 한 장 찍으면 보너스까지!"},
    {title: "뚜비가 산책 가방을 물어왔어요 🎒", body: "오늘 뚜비랑 한 바퀴 어때요? 산책 사진은 주 1회 +50점이에요!"},
  ]);
  // 산책 1500 임박/달성
  if (hasFam && total >= 1200 && total < 1500) return {title: `특별 산책까지 ${1500 - total}점! 🦮`, body: "광교호수공원 산책이 코앞! 뚜비가 들떠서 빙글빙글 돌고 있어요 🐾"};
  if (hasFam && total >= 1500 && total < 1700) return {title: "뚜비 특별 산책 준비됐어요! 🎉", body: "1500점 달성! 점수가 가장 낮은 분이 뚜비랑 호수공원 다녀와요 🐾"};
  // 간식 600 달성 직후
  if (hasFam && total >= 600 && total < 720) return {title: "뚜비 간식이 잠금 해제됐어요! 🎉", body: "600점 달성! 로하이드 화이트 밀크스틱, 뚜비가 기다리고 있어요 🦴"};
  // 간식 600 모으는 중
  if (hasFam && total < 600) return pick([
    {title: `특별 간식까지 ${600 - total}점! 🦴`, body: "조금만 더 모으면 뚜비 간식 GET! 뚜비가 입맛 다시는 중이에요 😋"},
    {title: "뚜비가 간식 앞에서 기다려요 🥺", body: "오늘 핑 한 장이면 간식 목표에 한 걸음 더! 뚜비가 초롱초롱 보고 있어요 🐶"},
    {title: "뚜비표 특별 간식 어때요? 🦴", body: "눈물·알레르기 걱정 없는 간식이 기다려요. 같이 점수 모아요!"},
  ]);
  // 오늘 핑 아직 (일반)
  if (!pingedToday) return {title: "📸 오늘 핑 아직이에요!", body: "한 장이면 +10점! 가족이 기다리고 있어요 🐾"};
  // 가족 모임
  if (!gathered) return {title: "👨‍👩‍👧‍👦 이번 주 가족 모임 사진!", body: "온 가족이 모여 한 장 찍으면 전원 +50점! 뚜비도 끼워줘요 🐾"};
  return null;
}

// 가족 데이터(핑 날짜/주간 보너스/총점/미용주기) 로드
async function loadFamilyContext(todayStr) {
  const thisWeek = weekKey(todayStr);
  const snap = await db.collection("pings").where("familyId", "==", FAMILY_ID).get();
  const datesByMember = {};
  const walkedThisWeek = {};
  let weekHadGathering = false;
  MEMBER_IDS.forEach((m) => { datesByMember[m] = new Set(); walkedThisWeek[m] = false; });
  snap.forEach((doc) => {
    const date = doc.id.slice(0, 10);
    const d = doc.data() || {};
    const member = d.memberId || doc.id.slice(11);
    if (!datesByMember[member]) return;
    datesByMember[member].add(date);
    if (weekKey(date) === thisWeek) {
      if (d.withDubi) walkedThisWeek[member] = true;
      if (d.familyGathering) weekHadGathering = true;
    }
  });
  // 가족 총점·미용주기 (앱이 coachState/current에 기록)
  let total = 0; let cycleDays = 0; let hasFam = false;
  try {
    const cs = await db.doc("coachState/current").get();
    if (cs.exists) {
      const d = cs.data() || {};
      total = d.total || 0;
      if (d.cycleStart) cycleDays = Math.round((Date.parse(todayStr) - Date.parse(d.cycleStart)) / 86400000);
      hasFam = true;
    }
  } catch (e) { /* coachState 없으면 가족 상황 생략 */ }
  return {datesByMember, walkedThisWeek, weekHadGathering, total, cycleDays, hasFam};
}

async function getTokenByMember() {
  const tokenSnap = await db.collection("fcmTokens").get();
  const map = {};
  tokenSnap.forEach((d) => { const t = d.data().token; if (t) map[d.id] = t; });
  return map;
}

// 매일 18:00 KST — 멤버별 맞춤 코칭 푸시
exports.coachReminder = onSchedule(
  {schedule: "0 18 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3"},
  async () => {
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const todayStr = kstNow.toISOString().slice(0, 10);
    const fam = await loadFamilyContext(todayStr);
    const tokenByMember = await getTokenByMember();
    let sent = 0;
    for (const m of MEMBER_IDS) {
      const token = tokenByMember[m];
      if (!token) continue;
      const s = streakOf(fam.datesByMember[m], todayStr);
      const tip = buildCoach({
        pingedToday: s.pingedToday, alive: s.alive, tier: s.tier, daysMore: s.daysMore, dormant: s.dormant,
        walked: fam.walkedThisWeek[m], gathered: fam.weekHadGathering,
        total: fam.total, cycleDays: fam.cycleDays, hasFam: fam.hasFam,
      });
      if (!tip) continue;
      try { await getMessaging().send(pushMsg(token, tip.title, tip.body)); sent++; } catch (e) { console.warn("coach push 실패", e); }
    }
    console.log(`coachReminder: ${sent}건 발송`);
  },
);

// 매일 21:30 KST — 오늘 아직 핑 안 한 가족에게 마감 임박 푸시
exports.deadlineReminder = onSchedule(
  {schedule: "30 21 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3"},
  async () => {
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const todayStr = kstNow.toISOString().slice(0, 10);
    const snap = await db.collection("pings").where("familyId", "==", FAMILY_ID).get();
    const pingedToday = new Set();
    snap.forEach((doc) => {
      if (doc.id.slice(0, 10) === todayStr) {
        const d = doc.data() || {};
        pingedToday.add(d.memberId || doc.id.slice(11));
      }
    });
    const tokenByMember = await getTokenByMember();
    const msgs = [
      {title: "오늘 핑 마감이 다가와요 ⏰", body: "자정 지나면 오늘은 끝이에요. 뚜비가 막차 기다리듯 기다려요 🐾"},
      {title: "깜빡하기 전에, 핑!", body: "곧 오늘 핑이 닫혀요. 뚜비랑 오늘 추억 남기는 거 잊지 마요! 📸"},
    ];
    let sent = 0;
    for (const m of MEMBER_IDS) {
      const token = tokenByMember[m];
      if (!token || pingedToday.has(m)) continue;
      const msg = pick(msgs);
      try { await getMessaging().send(pushMsg(token, msg.title, msg.body)); sent++; } catch (e) { console.warn("deadline push 실패", e); }
    }
    console.log(`deadlineReminder: ${sent}건 발송`);
  },
);
