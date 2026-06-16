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

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  self.registration.showNotification(n.title || '뚜비가 알려줘요 🐾', {
    body: n.body || '',
    icon: d.icon || n.icon || './dubi-push.png',
    badge: './dubi-push.png',
    tag: 'dubi-coach'
  });
});

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('https://www.ping.ai.kr/app.html'));
});
