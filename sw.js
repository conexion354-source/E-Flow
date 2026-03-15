const CACHE_NAME = "eflow-pro-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./eflow.png",
  "./mundoled.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(e.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});

/* Firebase Messaging dentro del mismo service worker */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD1s9NUDbZLfOx3DD6Q7t19qZjrdQ5NFek",
  authDomain: "e-flow-96cdc.firebaseapp.com",
  projectId: "e-flow-96cdc",
  storageBucket: "e-flow-96cdc.firebasestorage.app",
  messagingSenderId: "876330685560",
  appId: "1:876330685560:web:66770d640c34c8565ac98d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "E-Flow";
  const options = {
    body: payload?.notification?.body || "Nueva alerta",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: payload?.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./"));
});
