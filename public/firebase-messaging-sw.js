// public/firebase-messaging-sw.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getMessaging, onBackgroundMessage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js";

const firebaseApp = initializeApp({
  apiKey: "AIzaSyDbms1wjGNePw8V_SP9OJdNm4TBnSbp_YI",
  authDomain: "login-authentication-e4113.firebaseapp.com",
  databaseURL: "https://login-authentication-e4113-default-rtdb.firebaseio.com",
  projectId: "login-authentication-e4113",
  storageBucket: "login-authentication-e4113.appspot.com",
  messagingSenderId: "914208076072",
  appId: "1:914208076072:web:996aeb751f454bbb5da01d"
});

const messaging = getMessaging(firebaseApp);

onBackgroundMessage(messaging, (payload) => {
  console.log('[SW] Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/logo192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});