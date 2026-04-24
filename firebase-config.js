/*
  Configuración Firebase para E-Flow
  1) Reemplazá los valores YOUR_* por los de tu proyecto Firebase.
  2) Si dejás estos placeholders, la app seguirá funcionando con guardado local (sin nube).
*/
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

window.FIREBASE_OPTIONS = {
  // Carpeta destino para fotos de cheques en Firebase Storage
  storageFolder: "cheques"
};
