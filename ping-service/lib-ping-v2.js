// ============================================================
// 핑 v2 — 인증 + 가족 컨텍스트 모듈 (멀티테넌시 기반)
// ------------------------------------------------------------
// 라이브 app.html은 건드리지 않는 새 기반 코드입니다.
// ES 모듈: <script type="module">에서 import 해서 사용하세요.
//
//   import * as Ping from './lib-ping-v2.js';
//   await Ping.ensureAuth();           // 익명 로그인 보장
//   const fid = await Ping.createFamily({ name:'뚜비네 가족' });
//
// ⚠️ Firebase Auth는 "승인된 도메인"에서만 동작합니다.
//    file:// 로 열면 막히니 localhost 또는 배포 도메인(www.ping.ai.kr)에서 테스트하세요.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, linkWithPopup
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc,
  collection, getDocs, query, where, orderBy,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsdwetovnP6RrgMAxcWZc7tmAQHVHNuLM",
  authDomain: "ping-family.firebaseapp.com",
  projectId: "ping-family",
  storageBucket: "ping-family.firebasestorage.app",
  messagingSenderId: "1076131335477",
  appId: "1:1076131335477:web:45bc309dcbdfe315cd507c"
};

export const app     = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// 인증 상태 구독 (로그인/로그아웃 감지)
export function onAuth(cb) { return onAuthStateChanged(auth, cb); }

// ---------- 인증 ----------

// 익명 로그인 보장 — 이미 로그인돼 있으면 그 사용자를 반환
export function ensureAuth() {
  return new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, async (user) => {
      off();
      if (user) return resolve(user);
      try { resolve((await signInAnonymously(auth)).user); }
      catch (e) { reject(e); }
    });
  });
}

// 구글 로그인 — 익명 계정이면 연결(업그레이드), 아니면 일반 로그인
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cur = auth.currentUser;
  try {
    if (cur && cur.isAnonymous) {
      const res = await linkWithPopup(cur, provider); // 익명 → 구글 승격(데이터 유지)
      return res.user;
    }
    return (await signInWithPopup(auth, provider)).user;
  } catch (e) {
    // 이미 다른 계정에 연결된 구글이면 일반 로그인으로 폴백
    if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
      return (await signInWithPopup(auth, provider)).user;
    }
    throw e;
  }
}

export function getUid() { return auth.currentUser ? auth.currentUser.uid : null; }

// ---------- 현재 가족 컨텍스트 ----------
const LS_KEY = 'ping_currentFamilyId';
export function getCurrentFamilyId() { return localStorage.getItem(LS_KEY) || null; }
export function setCurrentFamilyId(fid) { if (fid) localStorage.setItem(LS_KEY, fid); }

// 경로 헬퍼
export const famDoc = (fid) => doc(db, 'families', fid);
export const famCol = (fid, name) => collection(db, 'families', fid, name);

// ---------- 가족 생성 / 합류 ----------

function genCode(len = 6) {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O/1/I 제외
  let s = ''; for (let i = 0; i < len; i++) s += ch[Math.floor(Math.random() * ch.length)];
  return s;
}

const DEFAULT_SCORE_RULES = {
  ping: 10, allMembers: 5, withPet: 30, gathering: 50,
  withPetWeekly: true, gatheringWeekly: true
};

// 새 가족 만들기 (방장)
//  - families/{fid}, members/{uid}, users/{uid}, inviteCodes/{code} 생성
//  - 반환: { familyId, inviteCode }
export async function createFamily({ name, myName = '', role = '', scoreRules = {}, season = { length: '3개월(시즌)' } } = {}) {
  const user = await ensureAuth();
  const uid = user.uid;

  const famRef = await addDoc(collection(db, 'families'), {
    name: name || '우리 가족',
    ownerUid: uid,
    season,
    scoreRules: { ...DEFAULT_SCORE_RULES, ...scoreRules },
    createdAt: serverTimestamp()
  });
  const fid = famRef.id;

  await setDoc(doc(db, 'families', fid, 'members', uid), {
    displayName: myName || '나', role, isOwner: true, joinedAt: serverTimestamp()
  });

  await setDoc(doc(db, 'users', uid), {
    familyIds: arrayUnion(fid), defaultFamilyId: fid
  }, { merge: true });

  const code = genCode();
  // NOTE: 운영에서는 보안을 위해 Cloud Function으로 생성 권장 (rules v2는 클라이언트 쓰기 금지)
  await setDoc(doc(db, 'inviteCodes', code), { familyId: fid, createdBy: uid, createdAt: serverTimestamp() });
  await updateDoc(famDoc(fid), { inviteCode: code }); // 가족 문서에도 보관(초대 화면 표시용)

  setCurrentFamilyId(fid);
  return { familyId: fid, inviteCode: code };
}

// 초대코드로 합류 (구성원)
export async function joinFamily(code, { myName = '', role = '' } = {}) {
  const user = await ensureAuth();
  const uid = user.uid;
  const snap = await getDoc(doc(db, 'inviteCodes', String(code).toUpperCase()));
  if (!snap.exists()) throw new Error('초대코드를 찾을 수 없어요');
  const fid = snap.data().familyId;

  await setDoc(doc(db, 'families', fid, 'members', uid), {
    displayName: myName || '나', role, isOwner: false, joinedAt: serverTimestamp()
  });
  await setDoc(doc(db, 'users', uid), { familyIds: arrayUnion(fid), defaultFamilyId: fid }, { merge: true });

  setCurrentFamilyId(fid);
  return { familyId: fid };
}

// ---------- 펫 / 보상 ----------

export async function addPet(fid, pet) {
  const ref = await ad