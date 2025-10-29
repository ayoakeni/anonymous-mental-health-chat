importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDbms1wjGNePw8V_SP9OJdNm4TBnSbp_YI",
  authDomain: "login-authentication-e4113.firebaseapp.com",
  projectId: "login-authentication-e4113",
  messagingSenderId: "914208076072",
  appId: "1:914208076072:web:996aeb751f454bbb5da01d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});