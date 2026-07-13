// FCM 백그라운드 메시지 처리용 서비스 워커 (앱이 꺼져 있거나 백그라운드일 때)
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBsdwetovnP6RrgMAxcWZc7tmAQHVHNuLM",
  authDomain: "ping-family.firebaseapp.com",
  projectId: "ping-family",
  storageBucket: "ping-family.firebasestorage.app",
  messagingSenderId: "1076131335477",
  appId: "1:1076131335477:web:45bc309dcbdfe315cd507c"
});

const messaging = firebase.messaging();

// 서버가 데이터 전용(payload.data)으로 보냄 → SW가 알림을 직접 1회만 생성 (중복 방지)
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || '뚜비가 알려줘요 🐾', {
    body: data.body || '',
    icon: data.icon || './dubi-push.png',
    badge: './dubi-push.png',
    // 고정 tag 사용 안 함: 서로 다른 알림이 하나로 합쳐지는 것 방지
    data: {link: data.link || 'https://www.ping.ai.kr/app.html'}
  });
});

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || 'https://www.ping.ai.kr/app.html';
  event.waitUntil(clients.openWindow(link));
});
