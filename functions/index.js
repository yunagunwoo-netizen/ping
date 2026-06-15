// 핑 FCM 푸시 발송용 Cloud Functions (Firestore 트리거)
// 배포: 핑 폴더에서  firebase deploy --only functions
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const APP_URL = "https://www.ping.ai.kr/app.html";
const FAMILY_ID = "kimfamily";
const MEMBER_IDS = ["아빠", "엄마", "윤아", "건우"];
// 연속 핑 마일스톤 (앱과 동일)
const STREAK_TIERS = [{days: 3, pt: 15}, {days: 7, pt: 40}, {days: 14, pt: 80}, {days: 30, pt: 150}];

// 보낸 사람을 제외한 가족들의 FCM 토큰 목록
async function getTokensExcept(exceptMemberId) {
  const snap = await db.collection("fcmTokens").get();
  const tokens = [];
  snap.forEach((d) => {
    const t = d.data().token;
    if (d.id !== exceptMemberId && t) tokens.push(t);
  });
  return tokens;
}

// 핑(생존신고)이 올라오면 → 나머지 가족에게 푸시
exports.onPing = onDocumentCreated("pings/{pingId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  const member = data.memberId || "가족";
  const tokens = await getTokensExcept(member);
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: "핑 도착 📸",
      body: `${member}님이 오늘의 핑을 올렸어요!`,
    },
    webpush: {fcmOptions: {link: APP_URL}},
  });
});

// 찌르기(콕)가 기록되면 → 대상 가족에게 푸시
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
  await getMessaging().send({
    token,
    notification: {
      title: "👈 콕!",
      body: `${from}님이 콕 찔렀어요. 오늘 핑 보내세요 📸`,
    },
    webpush: {fcmOptions: {link: APP_URL}},
  });
});

// ===== 뚜비 코칭 푸시 (매일 18:00 KST) =====
// 멤버별 보너스 기회를 계산해 개인화된 푸시를 보냄.
// 앱을 열면 인앱 뚜비 팝업이 같은 맥락의 팁을 다시 보여줌.
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
function buildTip(dateSet, walkedThisWeek, gatheredThisWeek, todayStr, yestStr) {
  const pingedToday = dateSet.has(todayStr);
  let start = pingedToday ? todayStr : (dateSet.has(yestStr) ? yestStr : null);
  let alive = 0;
  if (start) { let cur = start; while (dateSet.has(cur)) { alive++; cur = addDays(cur, -1); } }
  const afterToday = pingedToday ? alive : alive + 1;
  let tier = null;
  for (const t of STREAK_TIERS) { if (t.days >= afterToday) { tier = t; break; } }
  const daysMore = tier ? tier.days - afterToday : null;
  // 1) 마일스톤 임박
  if (tier && daysMore !== null && daysMore <= 1) {
    if (!pingedToday) {
      return `오늘 핑하면 ${afterToday}일 연속! ${daysMore > 0 ? `${daysMore}일만 더 하면 ` : ""}${tier.days}일 보너스 +${tier.pt}점이 코앞이에요 🔥`;
    }
    return `${daysMore === 0 ? "오늘이면" : `${daysMore}일만 더 핑하면`} ${tier.days}일 보너스 +${tier.pt}점! 조금만 더 힘내요 🔥`;
  }
  // 2) 이번 주 산책 아직
  if (!walkedThisWeek) return "오늘 뚜비랑 산책하며 한 장 찍으면 이번 주 +50점! 🚶🐾";
  // 3) 오늘 핑 아직
  if (!pingedToday) return "오늘 핑 아직이에요! 한 장이면 +10점, 연속도 이어가요 📸";
  // 4) 이번 주 가족 모임 아직
  if (!gatheredThisWeek) return "이번 주 온 가족 모임 사진 찍으면 전원 +50점! 👨‍👩‍👧‍👦";
  // 5) 다 했으면 푸시 생략
  return null;
}
exports.coachReminder = onSchedule(
  {schedule: "0 18 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3"},
  async () => {
    // KST 기준 오늘/어제
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const todayStr = kstNow.toISOString().slice(0, 10);
    const yestStr = addDays(todayStr, -1);
    const thisWeek = weekKey(todayStr);

    // 핑 로드 (단일 조건 → 복합 인덱스 불필요. 가족 앱이라 양이 적음)
    const snap = await db.collection("pings")
        .where("familyId", "==", FAMILY_ID)
        .get();
    const datesByMember = {}; // member -> Set(date)
    let weekHadGathering = false;
    const walkedThisWeek = {}; // member -> bool
    MEMBER_IDS.forEach((m) => { datesByMember[m] = new Set(); walkedThisWeek[m] = false; });
    snap.forEach((doc) => {
      const id = doc.id; // `${date}_${member}`
      const date = id.slice(0, 10);
      const d = doc.data() || {};
      const member = d.memberId || id.slice(11);
      if (!datesByMember[member]) return;
      datesByMember[member].add(date);
      if (weekKey(date) === thisWeek) {
        if (d.withDubi) walkedThisWeek[member] = true;
        if (d.familyGathering) weekHadGathering = true;
      }
    });

    // 토큰 로드
    const tokenSnap = await db.collection("fcmTokens").get();
    const tokenByMember = {};
    tokenSnap.forEach((d) => { const t = d.data().token; if (t) tokenByMember[d.id] = t; });

    const messages = [];
    for (const m of MEMBER_IDS) {
      const token = tokenByMember[m];
      if (!token) continue;
      const body = buildTip(datesByMember[m], walkedThisWeek[m], weekHadGathering, todayStr, yestStr);
      if (!body) continue; // 보낼 팁 없음
      messages.push({
        token,
        notification: {title: "뚜비가 알려줘요 🐾", body},
        webpush: {fcmOptions: {link: APP_URL}},
      });
    }
    for (const msg of messages) {
      try { await getMessaging().send(msg); } catch (e) { console.warn("coach push 실패", e); }
    }
    console.log(`coachReminder: ${messages.length}건 발송`);
  },
);
