importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDbms1wjGNePw8V_SP9OJdNm4TBnSbp_YI",
  authDomain: "login-authentication-e4113.firebaseapp.com",
  databaseURL: "https://login-authentication-e4113-default-rtdb.firebaseio.com",
  projectId: "login-authentication-e4113",
  storageBucket: "login-authentication-e4113.appspot.com",
  messagingSenderId: "914208076072",
  appId: "1:914208076072:web:996aeb751f454bbb5da01d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Notification";
  const options = {
    body: payload.notification?.body,
    icon: "/anonymous-logo.png",
    badge: "/badge.png",
    data: payload.data
  };
  self.registration.showNotification(title, options);
});

// CLICK TO OPEN DASHBOARD
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "https://yoursite.com/client-dashboard";
  event.waitUntil(
    clients.openWindow(url)
  );
});