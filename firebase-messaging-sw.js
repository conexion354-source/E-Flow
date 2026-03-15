importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD1s9NUDbZLfOx3DD6Q7t19qZjrdQ5NFek",
  authDomain: "e-flow-96cdc.firebaseapp.com",
  projectId: "e-flow-96cdc",
  storageBucket: "e-flow-96cdc.firebasestorage.app",
  messagingSenderId: "876330685560",
  appId: "1:876330685560:web:66770d640c34c8565ac98d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload?.notification?.title || "E-Flow";
  const options = {
    body: payload?.notification?.body || "Nueva alerta",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: payload?.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
