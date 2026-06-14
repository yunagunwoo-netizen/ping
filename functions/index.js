// 핑 FCM 푸시 발송용 Cloud Functions (Firestore 트리거)
// 배포: 핑 폴더에서  firebase deploy --only functions
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const APP_URL = "https://yunagunwoo-netizen.github.io/ping/";

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
