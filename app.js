const API = "https://script.google.com/macros/s/AKfycbxfn6Iyr4zG3MfZRtn21TzOnK7YK0juz7fodC-0kWm9nq-nT1-nqR4B68xDx-F2aDbFJA/exec";
const PASSWORD = "1234nn";
const REMOTE_REFRESH_MS = 45000;

const STORAGE = {
  localChecks: "eflow_local_checks_v2",
  statusOverrides: "eflow_status_overrides_v1",
  hiddenRemoteChecks: "eflow_hidden_remote_checks_v1",
  banks: "eflow_banks_v1",
  providers: "eflow_providers_v1",
  forceMobile: "eflow_force_mobile_v1"
};

const FIREBASE_REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];

const STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente", className: "status-pendiente" },
  { value: "depositado", label: "Depositado", className: "status-depositado" },
  { value: "cobrado", label: "Cobrado / Pagado", className: "status-cobrado" },
  { value: "rebotado", label: "Rebotado / Rechazado", className: "status-rebotado" },
  { value: "vendido", label: "Vendido al Banco", className: "status-vendido" },
  { value: "cancelado", label: "Cancelado", className: "status-cancelado" }
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Inicio", code: "IN" },
  { id: "register", label: "Nuevo", code: "NV" },
  { id: "calendar", label: "Fechas", code: "CA" },
  { id: "entities", label: "Contactos", code: "DI" },
  { id: "list", label: "Lista", code: "HI" },
  { id: "reports", label: "Estadística", code: "RE" }
];

const INITIAL_BANKS = [
  "Banco Galicia",
  "Santander",
  "BBVA",
  "Macro",
  "Banco Provincia",
  "Banco Nación"
];

const INITIAL_PROVIDERS = [
  "Proveedor SA",
  "Servicios de Limpieza SRL",
  "Cliente Los Andes"
];

const state = {
  remoteChecks: [],
  localChecks: [],
  checks: [],
  statusOverrides: {},
  hiddenRemoteChecks: [],
  banks: [...INITIAL_BANKS],
  providers: [...INITIAL_PROVIDERS],
  currentView: "dashboard",
  forceMobile: false,
  calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  listFilters: {
    direction: "todos",
    term: "",
    date: null,
    status: "todos",
    checkId: null
  },
  editingStatusId: null,
  editingStatusDraft: "pendiente",
  registerPhoto: null,
  registerPhotoFile: null,
  deferredPrompt: null,
  hasLoadedRemote: false,
  loadingRemote: false,
  apiStatusText: "Sin revisar.",
  apiBannerMessage: "",
  entitiesSyncStarted: false,
  firestoreMigrationAttempted: false,
  remoteRefreshTimer: null
};

const firebaseState = {
  ready: false,
  app: null,
  storage: null,
  db: null,
  unsubscribeChecks: null,
  unsubscribeEntities: null,
  message: "No configurado."
};

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDate(dateString, days) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return stripAccents(String(value || "").trim().toLowerCase()).replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let raw = String(value ?? "")
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return 0;

  const isNegative = raw.startsWith("-");
  raw = raw.replace(/-/g, "");

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const separators = [...raw].filter((char) => char === "," || char === ".").length;

  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    normalized = raw.replaceAll(thousandsSep, "").replace(decimalSep, ".");
  } else if (separators > 1) {
    const sep = lastComma >= 0 ? "," : ".";
    const decimals = raw.length - raw.lastIndexOf(sep) - 1;
    if (decimals > 0 && decimals <= 2) {
      const parts = raw.split(sep);
      normalized = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
    } else {
      normalized = raw.replaceAll(sep, "");
    }
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const [whole, fraction = ""] = raw.split(sep);
    const isThousands = fraction.length === 3 && whole.length <= 3;
    normalized = isThousands ? `${whole}${fraction}` : `${whole}.${fraction}`;
  }

  const n = Number(normalized);
  return Number.isNaN(n) ? 0 : (isNegative ? -n : n);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS"
  }).format(Number(amount || 0));
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function toISODate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slash = raw.split("/");
  if (slash.length === 3) {
    const day = Number(slash[0]);
    const month = Number(slash[1]);
    const year = Number(slash[2]);
    if (day && month && year) {
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return "";
  const y = fallback.getFullYear();
  const m = String(fallback.getMonth() + 1).padStart(2, "0");
  const d = String(fallback.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readJSONStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeJSONStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uniqueStrings(list) {
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const value = String(item || "").trim();
    if (!value) return;
    const key = normalizeText(value);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function normalizeStatus(value) {
  const v = normalizeText(value);
  if (v.includes("rebot") || v.includes("rechaz")) return "rebotado";
  if (v.includes("cancel") || v.includes("anulad")) return "cancelado";
  if (v.includes("deposit")) return "depositado";
  if (v.includes("cobr") || v.includes("pagad")) return "cobrado";
  if (v.includes("vendid")) return "vendido";
  return "pendiente";
}

function normalizeDirection(input) {
  const v = normalizeText(input);
  if (v.includes("recib") || v.includes("favor") || v.includes("cobrar") || v.includes("cliente")) {
    return "recibido";
  }
  return "emitido";
}

function normalizeType(value) {
  const v = normalizeText(value);
  if (v.includes("echeq") || v.includes("e-cheq")) return "echeq";
  return "fisico";
}

function sanitizeCheck(check, source, index) {
  const issueDate = toISODate(check.issueDate || check.fechaSalida) || getTodayString();
  const paymentDate = toISODate(check.paymentDate || check.fechaPago) || issueDate;
  const idBase = check.id || check.numeroCheque || check.checkNumber || `${source}-${index + 1}`;
  const cleanedId = String(idBase).replace(/\s+/g, "-").replace(/[\/#?\[\]]/g, "-").slice(0, 80) || `${source}-${index + 1}`;
  const stableId = cleanedId.startsWith(`${source}-`) ? cleanedId : `${source}-${cleanedId}`;

  return {
    id: stableId,
    syncId: cleanedId,
    source,
    direction: normalizeDirection(check.direction || check.sentido || check.observacion || check.estado),
    bank: String(check.bank || check.banco || "Sin banco").trim(),
    checkNumber: String(check.checkNumber || check.numeroCheque || "S/N").trim(),
    amount: parseAmount(check.amount ?? check.monto),
    payee: String(check.payee || check.proveedor || "Sin nombre").trim(),
    issueDate,
    paymentDate,
    photoUrl: check.photoUrl || null,
    status: normalizeStatus(check.status || check.estado),
    type: normalizeType(check.type || check.tipo),
    observacion: String(check.observacion || "").trim()
  };
}

function isPending(check) {
  return normalizeStatus(check.status) === "pendiente";
}

function compareByDateDesc(a, b) {
  if (a.paymentDate === b.paymentDate) return 0;
  return a.paymentDate > b.paymentDate ? -1 : 1;
}

function updateCombinedChecks() {
  if (canUseFirestoreSync() && firebaseState.unsubscribeChecks) {
    state.checks = [...state.remoteChecks].sort(compareByDateDesc);
    return;
  }

  const hiddenRemoteSet = new Set(state.hiddenRemoteChecks || []);
  const remote = state.remoteChecks.map((check) => {
    const status = state.statusOverrides[check.id] || check.status;
    return { ...check, status: normalizeStatus(status) };
  }).filter((check) => !hiddenRemoteSet.has(check.id));

  state.checks = [...remote, ...state.localChecks].sort(compareByDateDesc);
}

function setApiStatus(text) {
  state.apiStatusText = text;
  const apiEl = document.getElementById("apiStatusText");
  if (apiEl) apiEl.textContent = text;
}

function showStatus(message) {
  state.apiBannerMessage = message || "";
  const banner = document.getElementById("statusBanner");
  if (!banner) return;
  if (!message) {
    banner.classList.add("hidden");
    return;
  }
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function hasLocalOnlyWarning() {
  const text = normalizeText(state.apiBannerMessage || "");
  return text.includes("modo solo lectura") || text.includes("falta dopost") || text.includes("no se vera en otros dispositivos");
}

function isPlaceholderFirebaseValue(value) {
  const v = String(value || "").toUpperCase();
  return v.includes("YOUR_") || v.includes("TU_") || v.includes("XXXX");
}

function hasValidFirebaseConfig(config) {
  if (!config || typeof config !== "object") return false;
  return FIREBASE_REQUIRED_KEYS.every((key) => {
    const value = config[key];
    return Boolean(value) && !isPlaceholderFirebaseValue(value);
  });
}

function firebaseStatusLabel() {
  if (firebaseState.ready) return "Conectado";
  return firebaseState.message || "No configurado.";
}

function initFirebase() {
  const config = window.FIREBASE_CONFIG;

  if (!hasValidFirebaseConfig(config)) {
    firebaseState.ready = false;
    firebaseState.message = "No configurado.";
    return;
  }

  if (!window.firebase || !window.firebase.initializeApp) {
    firebaseState.ready = false;
    firebaseState.message = "SDK no cargado.";
    return;
  }

  try {
    firebaseState.app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(config);
    firebaseState.storage = window.firebase.storage();
    firebaseState.db = window.firebase.firestore ? window.firebase.firestore() : null;
    firebaseState.ready = true;
    firebaseState.message = "Conectado";
  } catch (error) {
    firebaseState.ready = false;
    firebaseState.message = `Error: ${error?.message || "init Firebase"}`;
  }
}

function canUseFirestoreSync() {
  return Boolean(firebaseState.ready && firebaseState.db);
}

function checksCollectionName() {
  return window.FIREBASE_OPTIONS?.checksCollection || "cheques";
}

function checksCollectionRef() {
  return firebaseState.db.collection(checksCollectionName());
}

function firebaseProjectId() {
  return window.FIREBASE_CONFIG?.projectId || "";
}

function firebaseApiKey() {
  return window.FIREBASE_CONFIG?.apiKey || "";
}

function entitiesDocRef() {
  const collection = window.FIREBASE_OPTIONS?.entitiesCollection || "cheques_photos";
  const docId = window.FIREBASE_OPTIONS?.entitiesDoc || "entities";
  return firebaseState.db.collection(collection).doc(docId);
}

function firestoreServerTimestamp() {
  return window.firebase?.firestore?.FieldValue?.serverTimestamp
    ? window.firebase.firestore.FieldValue.serverTimestamp()
    : new Date().toISOString();
}

function buildEntitiesPayload() {
  return {
    banks: uniqueStrings(state.banks),
    providers: uniqueStrings(state.providers),
    updatedAt: firestoreServerTimestamp(),
    source: "eflow-directory"
  };
}

function startFirestoreEntitiesSync() {
  if (!canUseFirestoreSync()) return false;
  if (firebaseState.unsubscribeEntities) return true;

  firebaseState.unsubscribeEntities = entitiesDocRef().onSnapshot(
    async (doc) => {
      if (!doc.exists) {
        await entitiesDocRef().set(buildEntitiesPayload(), { merge: true });
        return;
      }

      const data = doc.data() || {};
      state.banks = Array.isArray(data.banks) ? uniqueStrings(data.banks) : [];
      state.providers = Array.isArray(data.providers) ? uniqueStrings(data.providers) : [];
      saveEntitiesLocalOnly();

      if (state.currentView === "entities" || state.currentView === "register") {
        renderApp();
      } else {
        renderDesktopNav();
      }
    },
    (error) => {
      showStatus(`No se pudo sincronizar el directorio. ${error?.message || "Error"}`);
    }
  );

  return true;
}

function stopFirestoreEntitiesSync() {
  if (firebaseState.unsubscribeEntities) {
    firebaseState.unsubscribeEntities();
    firebaseState.unsubscribeEntities = null;
  }
}

function firestoreRestValueToJS(field) {
  if (!field || typeof field !== "object") return null;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return Boolean(field.booleanValue);
  if ("nullValue" in field) return null;
  if ("timestampValue" in field) return field.timestampValue;
  if ("arrayValue" in field) {
    return (field.arrayValue.values || []).map((item) => firestoreRestValueToJS(item));
  }
  if ("mapValue" in field) {
    return firestoreRestFieldsToJS(field.mapValue.fields || {});
  }
  return null;
}

function firestoreRestFieldsToJS(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, firestoreRestValueToJS(value)])
  );
}

async function fetchFirestoreChecksViaRest() {
  const projectId = firebaseProjectId();
  const apiKey = firebaseApiKey();
  if (!projectId || !apiKey) return [];

  let pageToken = "";
  const docs = [];
  do {
    const params = new URLSearchParams({ pageSize: "300", key: apiKey });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeURIComponent(checksCollectionName())}?${params.toString()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Firestore REST HTTP ${response.status}`);
    const data = await response.json();
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return docs.map((doc, index) => {
    const id = String(doc.name || "").split("/").pop() || `remote-${index + 1}`;
    return sanitizeCheck({ id, ...firestoreRestFieldsToJS(doc.fields || {}) }, "remote", index);
  });
}

async function loadFirestoreChecksOnce() {
  if (!canUseFirestoreSync()) return;

  const snapshot = await checksCollectionRef().get({ source: "server" }).catch(() => null);
  let checks = snapshot
    ? snapshot.docs.map((doc, index) => sanitizeCheck({ id: doc.id, ...doc.data() }, "remote", index))
    : [];

  if (!checks.length) {
    checks = await fetchFirestoreChecksViaRest();
  }

  state.remoteChecks = checks;
  state.hasLoadedRemote = true;
  updateCombinedChecks();
  setApiStatus("Firebase tiempo real conectado.");
  renderApp();
}

function buildFirestoreCheckData(check, override = {}) {
  const normalized = {
    direction: normalizeDirection(check.direction),
    bank: String(check.bank || "").trim(),
    checkNumber: String(check.checkNumber || "").trim(),
    amount: parseAmount(check.amount),
    payee: String(check.payee || "").trim(),
    issueDate: toISODate(check.issueDate) || getTodayString(),
    paymentDate: toISODate(check.paymentDate) || toISODate(check.issueDate) || getTodayString(),
    photoUrl: check.photoUrl || null,
    status: normalizeStatus(check.status),
    type: normalizeType(check.type),
    observacion: String(check.observacion || "").trim(),
    updatedAt: firestoreServerTimestamp(),
    ...override
  };

  return {
    ...normalized,
    fechaSalida: normalized.issueDate,
    proveedor: normalized.payee,
    fechaPago: normalized.paymentDate,
    banco: normalized.bank,
    numeroCheque: normalized.checkNumber,
    tipo: normalized.type,
    monto: normalized.amount,
    estado: normalized.status
  };
}

function stopFirestoreRealtimeChecks() {
  if (firebaseState.unsubscribeChecks) {
    firebaseState.unsubscribeChecks();
    firebaseState.unsubscribeChecks = null;
  }
  stopFirestoreEntitiesSync();
}

function startFirestoreRealtimeChecks() {
  if (!canUseFirestoreSync()) return false;
  if (firebaseState.unsubscribeChecks) {
    startFirestoreEntitiesSync();
    return true;
  }

  startFirestoreEntitiesSync();
  setApiStatus("Firebase tiempo real conectado.");
  firebaseState.message = "Tiempo real activo";
  loadFirestoreChecksOnce().catch((error) => {
    showStatus(`No se pudo cargar Firestore. ${error?.message || "Error"}`);
  });

  firebaseState.unsubscribeChecks = checksCollectionRef()
    .onSnapshot(
      (snapshot) => {
        if (snapshot.empty && snapshot.metadata?.fromCache && state.remoteChecks.length) {
          return;
        }
        if (snapshot.empty && !state.remoteChecks.length) {
          loadFirestoreChecksOnce().catch((error) => {
            showStatus(`No se pudo cargar Firestore. ${error?.message || "Error"}`);
          });
          return;
        }
        state.remoteChecks = snapshot.docs.map((doc, index) =>
          sanitizeCheck({ id: doc.id, ...doc.data() }, "remote", index)
        );
        state.hasLoadedRemote = true;
        updateCombinedChecks();
        if (snapshot.empty && !state.firestoreMigrationAttempted) {
          migrateExistingChecksToFirestore();
        } else if (!hasLocalOnlyWarning()) {
          showStatus("");
        }
        setApiStatus("Firebase tiempo real conectado.");
        renderApp();
      },
      (error) => {
        firebaseState.message = `Error tiempo real: ${error?.message || "Firestore"}`;
        setApiStatus("Error en Firebase tiempo real.");
        showStatus(`No se pudo escuchar Firebase en tiempo real. ${error?.message || "Error"}`);
        stopFirestoreRealtimeChecks();
        loadRemoteChecks();
      }
    );

  return true;
}

async function importChecksToFirestore(checks) {
  if (!canUseFirestoreSync() || !checks.length) return 0;

  let imported = 0;
  for (let i = 0; i < checks.length; i += 450) {
    const batch = firebaseState.db.batch();
    checks.slice(i, i + 450).forEach((check) => {
      const docId = check.syncId || String(check.id || `check-${Date.now()}-${imported}`).replace(/^remote-/, "");
      const docRef = checksCollectionRef().doc(docId);
      batch.set(
        docRef,
        buildFirestoreCheckData(check, {
          createdAt: firestoreServerTimestamp(),
          migratedAt: firestoreServerTimestamp()
        }),
        { merge: true }
      );
      imported += 1;
    });
    await batch.commit();
  }

  return imported;
}

async function migrateExistingChecksToFirestore() {
  if (!canUseFirestoreSync() || state.firestoreMigrationAttempted) return;
  state.firestoreMigrationAttempted = true;

  setApiStatus("Migrando datos anteriores a Firebase...");
  showStatus("Estoy recuperando los cheques anteriores y pasándolos a Firebase para sincronizarlos.");

  try {
    const legacyChecks = await fetchLegacyApiChecks();
    const localChecks = state.localChecks.map((check, index) => sanitizeCheck(check, "local", index));
    const byId = new Map();

    [...legacyChecks, ...localChecks].forEach((check) => {
      const key = check.syncId || check.id;
      if (!key) return;
      byId.set(key, check);
    });

    const imported = await importChecksToFirestore([...byId.values()]);
    if (imported > 0) {
      setApiStatus("Datos migrados a Firebase.");
      showStatus(`Listo: migré ${imported} cheque(s) a Firebase. Desde ahora se sincronizan entre dispositivos.`);
    } else {
      setApiStatus("Firebase tiempo real conectado.");
      showStatus("Firebase está conectado, pero no encontré cheques anteriores para migrar.");
    }
  } catch (error) {
    setApiStatus("Firebase conectado, migración pendiente.");
    showStatus(`Firebase está conectado, pero no pude importar los datos anteriores. ${error?.message || "Error"}`);
  }
}

async function createCheckFirestore(check) {
  const docId = check.syncId || check.id || `check-${Date.now()}`;
  await checksCollectionRef().doc(docId).set(
    buildFirestoreCheckData(check, {
      createdAt: firestoreServerTimestamp()
    }),
    { merge: true }
  );
}

async function updateCheckStatusFirestore(check, newStatus) {
  const docId = check.syncId || String(check.id || "").replace(/^remote-/, "");
  await checksCollectionRef().doc(docId).set(
    buildFirestoreCheckData(check, {
      status: normalizeStatus(newStatus),
      estado: normalizeStatus(newStatus)
    }),
    { merge: true }
  );
}

async function deleteCheckFirestore(check) {
  const docId = check.syncId || String(check.id || "").replace(/^remote-/, "");
  await checksCollectionRef().doc(docId).delete();
}

async function updateCheckFirestoreData(check) {
  const docId = check.syncId || String(check.id || "").replace(/^remote-/, "");
  await checksCollectionRef().doc(docId).set(buildFirestoreCheckData(check), { merge: true });
}

async function uploadPhotoToFirebase(file, checkId, checkData) {
  if (!firebaseState.ready || !file) return null;

  const rawExt = String(file.name || "").split(".").pop() || "jpg";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const folder = window.FIREBASE_OPTIONS?.storageFolder || "cheques";
  const path = `${folder}/${checkId}-${Date.now()}.${ext}`;

  const ref = firebaseState.storage.ref().child(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();

  if (firebaseState.db) {
    await firebaseState.db.collection("cheques_photos").doc(checkId).set(
      {
        checkId,
        path,
        url,
        bank: checkData.bank || "",
        payee: checkData.payee || "",
        checkNumber: checkData.checkNumber || "",
        paymentDate: checkData.paymentDate || "",
        source: "eflow-app",
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  return url;
}

function resetRegisterPhotoPreview() {
  const preview = document.getElementById("photoPreview");
  if (!preview) return;
  if (!state.registerPhoto) {
    preview.innerHTML = "";
    return;
  }
  preview.innerHTML = `
    <img src="${escapeHtml(state.registerPhoto)}" alt="Foto" class="photo-preview" />
    <button type="button" class="btn-danger" id="removePhotoBtn">Quitar</button>
  `;

  const removeBtn = document.getElementById("removePhotoBtn");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      state.registerPhoto = null;
      state.registerPhotoFile = null;
      resetRegisterPhotoPreview();
    });
  }
}

async function fetchLegacyApiChecks() {
  const response = await fetch(`${API}?t=${Date.now()}`, { cache: "no-store" });
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("La API anterior no devolvió JSON válido.");
  }

  if (!Array.isArray(data)) {
    throw new Error(data?.error || "La API anterior no devolvió una lista.");
  }

  return data.map((row, index) =>
    sanitizeCheck(
      {
        id: row.id || `${row.numeroCheque || "remote"}-${row.fechaPago || index}`,
        direction: row.direction || row.sentido || row.tipo || row.observacion || row.estado,
        bank: row.banco,
        checkNumber: row.numeroCheque,
        amount: row.monto,
        payee: row.proveedor,
        issueDate: row.fechaSalida,
        paymentDate: row.fechaPago,
        status: row.estado,
        type: row.tipo,
        observacion: row.observacion
      },
      "remote",
      index
    )
  );
}

async function loadRemoteChecks() {
  if (startFirestoreRealtimeChecks()) return;
  if (state.loadingRemote) return;

  state.loadingRemote = true;
  setApiStatus("Consultando planilla...");

  try {
    state.remoteChecks = await fetchLegacyApiChecks();

    updateCombinedChecks();
    state.hasLoadedRemote = true;

    if (!state.remoteChecks.length) {
      showStatus("La API respondió, pero no devolvió registros.");
    } else {
      if (!hasLocalOnlyWarning()) showStatus("");
    }

    setApiStatus("Conectado correctamente.");
  } catch (error) {
    state.remoteChecks = [];
    updateCombinedChecks();
    state.hasLoadedRemote = true;
    showStatus(`No se pudieron cargar los datos remotos. ${error?.message || error}`);
    setApiStatus("Error al conectar con la API.");
  } finally {
    state.loadingRemote = false;
    renderApp();
  }
}

function isHtmlResponse(text) {
  const normalized = String(text || "").trim().toLowerCase();
  return normalized.startsWith("<!doctype") || normalized.startsWith("<html");
}

function isDoPostMissingText(text) {
  const plain = String(text || "").replace(/<[^>]*>/g, " ");
  const normalized = stripAccents(plain).toLowerCase().replace(/\s+/g, " ");
  return normalized.includes("no se encontro la funcion de la secuencia de comandos: dopost");
}

function isDoPostMissingError(error) {
  const message = normalizeText(error?.message || "");
  return message.includes("dopost") || message.includes("solo lectura");
}

function buildLocalOnlySyncMessage(prefix, error) {
  if (isDoPostMissingError(error)) {
    return `${prefix} La API está en modo solo lectura (falta doPost), así que este cambio no se verá en otros dispositivos.`;
  }
  return `${prefix} (${error?.message || "error"}). Se guardó solo en este dispositivo.`;
}

function buildCheckApiPayload(check, override = {}) {
  const row = {
    id: check.syncId || check.id,
    fechaSalida: check.issueDate || "",
    proveedor: check.payee || "",
    fechaPago: check.paymentDate || "",
    banco: check.bank || "",
    numeroCheque: check.checkNumber || "",
    tipo: check.type || "",
    monto: String(check.amount ?? ""),
    estado: check.status || "",
    observacion: check.observacion || ""
  };

  return {
    ...row,
    check: row,
    syncId: check.syncId || check.id,
    remoteId: check.syncId || check.id,
    ...override
  };
}

async function sendApiMutation(operation, payload) {
  const body = {
    operation,
    op: operation,
    action: operation,
    accion: operation,
    ...payload
  };

  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (isHtmlResponse(text)) {
        if (isDoPostMissingText(text)) {
          throw new Error("La API está en modo solo lectura (falta doPost).");
        }
        throw new Error("La API devolvió HTML en lugar de JSON.");
      }
    }
  }

  if (data?.error) throw new Error(data.error);
  if (data && (data.ok === false || data.success === false)) {
    throw new Error(data.message || "La API rechazó la operación.");
  }

  return data || { ok: true };
}

async function createCheckRemote(check) {
  if (canUseFirestoreSync()) {
    return createCheckFirestore(check);
  }
  const payload = buildCheckApiPayload(check);
  return sendApiMutation("create", payload);
}

async function updateCheckStatusRemote(check, newStatus) {
  if (canUseFirestoreSync()) {
    return updateCheckStatusFirestore(check, newStatus);
  }
  const payload = buildCheckApiPayload(check, {
    status: newStatus,
    estado: newStatus
  });
  return sendApiMutation("update_status", payload);
}

async function deleteCheckRemote(check) {
  if (canUseFirestoreSync()) {
    return deleteCheckFirestore(check);
  }
  const payload = buildCheckApiPayload(check);
  return sendApiMutation("delete", payload);
}

async function updateCheckRemoteData(check) {
  if (canUseFirestoreSync()) {
    return updateCheckFirestoreData(check);
  }
  const payload = buildCheckApiPayload(check);
  const operations = ["update", "edit", "update_check"];
  let lastError = null;
  for (const operation of operations) {
    try {
      return await sendApiMutation(operation, payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No se pudo editar en la API.");
}

function saveLocalChecks() {
  writeJSONStorage(STORAGE.localChecks, state.localChecks);
}

function saveStatusOverrides() {
  writeJSONStorage(STORAGE.statusOverrides, state.statusOverrides);
}

function saveHiddenRemoteChecks() {
  writeJSONStorage(STORAGE.hiddenRemoteChecks, state.hiddenRemoteChecks);
}

function saveEntitiesLocalOnly() {
  writeJSONStorage(STORAGE.banks, state.banks);
  writeJSONStorage(STORAGE.providers, state.providers);
}

async function saveEntities() {
  state.banks = uniqueStrings(state.banks);
  state.providers = uniqueStrings(state.providers);
  saveEntitiesLocalOnly();

  if (!canUseFirestoreSync()) return;

  try {
    await entitiesDocRef().set(buildEntitiesPayload(), { merge: true });
  } catch (error) {
    showStatus(`No se pudo sincronizar el directorio. ${error?.message || "Error"}`);
  }
}

function setView(view) {
  state.currentView = view;
  if (view !== "calendar") state.selectedDate = null;
  renderApp();
}

function setListFilters(next) {
  state.listFilters = {
    direction: next?.direction ?? state.listFilters.direction,
    term: next?.term ?? state.listFilters.term,
    date: Object.prototype.hasOwnProperty.call(next || {}, "date") ? next.date : state.listFilters.date,
    status: next?.status ?? state.listFilters.status,
    checkId: Object.prototype.hasOwnProperty.call(next || {}, "checkId") ? next.checkId : state.listFilters.checkId
  };
}

function resetListFilters() {
  state.listFilters = { direction: "todos", term: "", date: null, status: "todos", checkId: null };
}

function updateForceMobile(enabled) {
  const isDesktopViewport = window.matchMedia("(min-width: 980px)").matches;
  state.forceMobile = isDesktopViewport ? Boolean(enabled) : false;
  localStorage.setItem(STORAGE.forceMobile, state.forceMobile ? "1" : "0");
  renderApp();
}

function dashboardStats() {
  const today = getTodayString();
  const tomorrow = addDaysToDate(today, 1);

  const emitidosHoy = state.checks.filter((c) => c.direction === "emitido" && c.paymentDate === today && isPending(c));
  const recibidosHoy = state.checks.filter((c) => c.direction === "recibido" && c.paymentDate === today && isPending(c));
  const emitidosPendientes = state.checks.filter((c) => c.direction === "emitido" && isPending(c));
  const recibidosPendientes = state.checks.filter((c) => c.direction === "recibido" && isPending(c));

  const criticos = state.checks
    .filter((c) => isPending(c) && c.paymentDate <= tomorrow)
    .sort((a, b) => (a.paymentDate > b.paymentDate ? 1 : -1));

  return {
    emitidosHoy,
    recibidosHoy,
    emitidosPendientes,
    recibidosPendientes,
    totalEmitidosHoy: emitidosHoy.reduce((sum, c) => sum + c.amount, 0),
    totalRecibidosHoy: recibidosHoy.reduce((sum, c) => sum + c.amount, 0),
    totalEmitidosPendientes: emitidosPendientes.reduce((sum, c) => sum + c.amount, 0),
    totalRecibidosPendientes: recibidosPendientes.reduce((sum, c) => sum + c.amount, 0),
    criticos
  };
}

function renderDesktopNav() {
  const nav = document.getElementById("desktopNav");
  if (!nav) return;

  const items = NAV_ITEMS.map((item) => {
    const active = item.id === state.currentView ? "active" : "";
    return `
      <button class="nav-btn ${active}" data-nav-view="${item.id}" type="button">
        <span>${item.label}</span>
        <span class="nav-badge">${item.code}</span>
      </button>
    `;
  }).join("");

  nav.innerHTML = `
    <div class="brand-block">
      <img src="eflow.png" alt="E-Flow" />
      <strong>E-Flow</strong>
    </div>

    <div class="nav-list scrollbar">${items}</div>

    <div class="nav-footer">
      <div class="connection-box">
        <strong>Estado API</strong>
        <p id="apiStatusText">${escapeHtml(state.apiStatusText)}</p>
        <strong>Firebase</strong>
        <p id="firebaseStatusText">${escapeHtml(firebaseStatusLabel())}</p>
      </div>
      <button class="btn-danger" id="logoutBtnDesktop" type="button">Cerrar sesión</button>
    </div>
  `;

  nav.querySelectorAll("[data-nav-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.dataset.navView;
      if (targetView === "list") resetListFilters();
      setView(targetView);
    });
  });

  const logoutBtn = document.getElementById("logoutBtnDesktop");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}

function renderMobileNav() {
  const nav = document.getElementById("mobileNav");
  if (!nav) return;

  nav.innerHTML = NAV_ITEMS.map((item) => {
    const active = item.id === state.currentView ? "active" : "";
    return `
      <button class="mobile-btn ${active}" data-mobile-view="${item.id}" type="button">
        <span class="nav-badge">${item.code}</span>
        <span>${item.label}</span>
      </button>
    `;
  }).join("");

  nav.querySelectorAll("[data-mobile-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.dataset.mobileView;
      if (targetView === "list") resetListFilters();
      setView(targetView);
    });
  });
}

function renderDashboardView() {
  const stats = dashboardStats();
  const today = getTodayString();

  return `
    <section>
      <div class="section-head">
        <h1>Resumen Financiero</h1>
        <p>Control general de obligaciones y cobros.</p>
      </div>

      <div class="widgets">
        <article class="widget is-red" data-dashboard-direction="emitido" data-dashboard-date="${today}">
          <div class="label">Pagos de hoy</div>
          <h2>${formatCurrency(stats.totalEmitidosHoy)}</h2>
          <small>${stats.emitidosHoy.length} a cubrir</small>
        </article>

        <article class="widget is-green" data-dashboard-direction="recibido" data-dashboard-date="${today}">
          <div class="label">Cobros de hoy</div>
          <h2>${formatCurrency(stats.totalRecibidosHoy)}</h2>
          <small>${stats.recibidosHoy.length} a cobrar</small>
        </article>

        <article class="widget" data-dashboard-direction="emitido">
          <div class="label">Total a pagar</div>
          <h2>${formatCurrency(stats.totalEmitidosPendientes)}</h2>
          <small>${stats.emitidosPendientes.length} pendientes</small>
        </article>

        <article class="widget" data-dashboard-direction="recibido">
          <div class="label">Total a cobrar</div>
          <h2>${formatCurrency(stats.totalRecibidosPendientes)}</h2>
          <small>${stats.recibidosPendientes.length} en cartera</small>
        </article>
      </div>

      <article class="panel">
        <header class="panel-head">
          <strong>Atención Inmediata</strong>
          <button class="btn-soft" type="button" id="dashboardGoList">Ver todos</button>
        </header>
        <div class="panel-body">
          ${
            stats.criticos.length
              ? stats.criticos
                  .map((check) => {
                    const dueLabel = check.paymentDate === today ? "Hoy" : "Mañana";
                    return `
                      <div class="attention-item" data-attention-id="${escapeHtml(check.id)}">
                        <div>
                          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span class="badge ${check.direction === "emitido" ? "up" : "down"}">
                              ${check.direction === "emitido" ? "PAGO" : "COBRO"}
                            </span>
                            <span class="badge ${check.type === "echeq" ? "type-echeq" : "type-fisico"}">${escapeHtml(check.type)}</span>
                            <strong>${escapeHtml(check.payee)}</strong>
                          </div>
                          <div class="attention-meta">
                            ${escapeHtml(check.bank)} · Nº ${escapeHtml(check.checkNumber)} · ${dueLabel}
                          </div>
                        </div>
                        <div class="amount ${check.direction}">
                          ${check.direction === "emitido" ? "-" : "+"}${formatCurrency(check.amount)}
                        </div>
                      </div>
                    `;
                  })
                  .join("")
              : '<div class="empty">No hay cheques con vencimiento hoy o mañana.</div>'
          }
        </div>
      </article>
    </section>
  `;
}

function getRegisterConflicts(direction, paymentDate, currentAmount) {
  if (direction !== "emitido" || !paymentDate) return [];
  return state.checks.filter((check) => {
    return check.direction === "emitido" && check.paymentDate === paymentDate && isPending(check);
  }).map((check) => ({ ...check })).sort(compareByDateDesc);
}

function renderRegisterView() {
  const today = getTodayString();
  const conflicts = getRegisterConflicts("emitido", today, 0);

  return `
    <section>
      <div class="section-head">
        <h1>Registrar Cheque</h1>
        <p>Carga pagos emitidos o cobros a favor.</p>
      </div>

      <form id="registerForm" class="form-wrap">
        <div class="form-inner">
          <div class="segment">
            <button type="button" class="active" data-dir-btn="emitido">Emitido (Pagar)</button>
            <button type="button" data-dir-btn="recibido">A Favor (Cobrar)</button>
          </div>
          <input type="hidden" name="direction" value="emitido" />

          <div class="type-switch" id="typeSwitch">
            <label class="active fisico" data-type-label="fisico">
              <input type="radio" name="type" value="fisico" checked />
              Físico
            </label>
            <label class="echeq" data-type-label="echeq">
              <input type="radio" name="type" value="echeq" />
              Echeq
            </label>
          </div>

          <div class="grid-2">
            <div class="field">
              <label>Banco</label>
              <input required type="text" name="bank" data-suggest-input="banks" autocomplete="off" placeholder="Ej. Banco Santander" />
              <div class="suggestion-chips" data-suggest-list="banks"></div>
            </div>

            <div class="field">
              <label>Número / ID</label>
              <input required type="text" name="checkNumber" placeholder="Ej. 00012345" />
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label id="payeeLabel">Páguese a (Proveedor)</label>
              <input required type="text" name="payee" data-suggest-input="providers" autocomplete="off" placeholder="Nombre o Razón Social" />
              <div class="suggestion-chips" data-suggest-list="providers"></div>
            </div>

            <div class="field">
              <label>Monto</label>
              <input required type="number" name="amount" min="0" step="0.01" placeholder="0.00" />
              <div class="hint" id="amountTextHint"></div>
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label>Fecha de emisión</label>
              <input required type="date" name="issueDate" value="${today}" />
            </div>

            <div class="field">
              <label>Fecha de cobro / pago</label>
              <input required type="date" name="paymentDate" value="${today}" />
            </div>
          </div>

          <div class="field" id="quickDaysWrap">
            <label>Cálculo rápido desde fecha de emisión</label>
            <div class="quick-days">
              ${[15, 30, 45, 60, 90, 120].map((d) => `<button type="button" data-quick-days="${d}">+${d}d</button>`).join("")}
            </div>
          </div>

          <div id="conflictBox" class="warning-box ${conflicts.length ? "" : "hidden"}"></div>

          <div class="field">
            <label>Foto del cheque (opcional)</label>
            <div class="photo-box">
              <input id="photoInput" type="file" accept="image/*" />
              <div id="photoPreview"></div>
            </div>
          </div>
        </div>

        <footer class="form-footer">
          <button type="button" class="btn-ghost" id="registerCancelBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar cheque</button>
        </footer>
      </form>
    </section>
  `;
}

function renderCalendarView() {
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ];

  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();

  const firstDate = new Date(year, month, 1);
  const firstDay = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<div class="day-cell empty"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const checks = state.checks.filter((c) => c.paymentDate === date && isPending(c));
    const hasChecks = checks.length > 0;
    const isToday = date === getTodayString();
    const isSelected = state.selectedDate === date;

    const dots = checks.slice(0, 3).map((c) => `<span class="dot ${c.direction === "emitido" ? "red" : "green"}"></span>`).join("");

    cells.push(`
      <button type="button" class="day-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" ${
      hasChecks ? `data-calendar-date="${date}"` : "disabled"
    }>
        <span class="day-num">${day}</span>
        <div class="day-dots">${dots}${checks.length > 3 ? '<span style="font-size:10px;color:#64748b;">+</span>' : ""}</div>
      </button>
    `);
  }

  const selectedChecks = state.selectedDate
    ? state.checks.filter((c) => c.paymentDate === state.selectedDate && isPending(c)).sort(compareByDateDesc)
    : [];

  const detail = state.selectedDate
    ? `
      <div>
        <h3 style="margin:0;">Detalle del día</h3>
        <p class="hint" style="margin-top:4px;">${formatDate(state.selectedDate)}</p>
      </div>
      <div style="margin-top:12px;display:grid;gap:10px;max-height:60vh;overflow:auto;" class="scrollbar">
        ${
          selectedChecks.length
            ? selectedChecks
                .map(
                  (check) => `
              <div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
                  <strong>${escapeHtml(check.payee)}</strong>
                  <span class="amount ${check.direction}">${check.direction === "emitido" ? "-" : "+"}${formatCurrency(check.amount)}</span>
                </div>
                <div class="hint" style="margin-top:6px;">${escapeHtml(check.bank)} · Nº ${escapeHtml(check.checkNumber)}</div>
              </div>
            `
                )
                .join("")
            : '<div class="empty">No hay cheques pendientes para este día.</div>'
        }
      </div>
    `
    : '<div class="empty">Selecciona un día con cheques pendientes.</div>';

  return `
    <section>
      <div class="section-head">
        <h1>Calendario</h1>
        <p>Rojos = pagos emitidos, verdes = cobros a favor.</p>
      </div>

      <div class="calendar-layout">
        <article class="calendar-box">
          <div class="calendar-head">
            <strong>${monthNames[month]} ${year}</strong>
            <div class="month-switch">
              <button type="button" id="prevMonthBtn">◀</button>
              <button type="button" id="nextMonthBtn">▶</button>
            </div>
          </div>
          <div class="week-row">${dayNames.map((d) => `<div>${d}</div>`).join("")}</div>
          <div class="days-grid">${cells.join("")}</div>
        </article>

        <article class="calendar-detail">${detail}</article>
      </div>
    </section>
  `;
}

function renderEntitiesView() {
  return `
    <section>
      <div class="section-head">
        <h1>Directorio</h1>
        <p>Administra bancos y contactos frecuentes.</p>
      </div>

      <div class="entity-layout">
        <article class="entity-box">
          <h3 style="margin-top:0;">Contactos</h3>
          <form id="providerForm" class="inline-form">
            <input required type="text" id="newProvider" placeholder="Nuevo contacto" />
            <button class="btn-primary" type="submit">Agregar</button>
          </form>
          <div class="entity-list scrollbar">
            ${
              state.providers.length
                ? state.providers
                    .map(
                      (provider) => `
                  <div class="entity-row">
                    <span>${escapeHtml(provider)}</span>
                    <button type="button" data-remove-provider="${escapeHtml(provider)}">Quitar</button>
                  </div>
                `
                    )
                    .join("")
                : '<div class="empty">Sin contactos.</div>'
            }
          </div>
        </article>

        <article class="entity-box">
          <h3 style="margin-top:0;">Bancos</h3>
          <form id="bankForm" class="inline-form">
            <input required type="text" id="newBank" placeholder="Nuevo banco" />
            <button class="btn-primary" type="submit">Agregar</button>
          </form>
          <div class="entity-list scrollbar">
            ${
              state.banks.length
                ? state.banks
                    .map(
                      (bank) => `
                  <div class="entity-row">
                    <span>${escapeHtml(bank)}</span>
                    <button type="button" data-remove-bank="${escapeHtml(bank)}">Quitar</button>
                  </div>
                `
                    )
                    .join("")
                : '<div class="empty">Sin bancos.</div>'
            }
          </div>
        </article>
      </div>
    </section>
  `;
}

function getFilteredChecks() {
  const term = normalizeText(state.listFilters.term);

  return [...state.checks]
    .filter((check) => {
      if (state.listFilters.direction !== "todos" && check.direction !== state.listFilters.direction) return false;
      if (state.listFilters.date !== null && check.paymentDate !== state.listFilters.date) return false;
      if (state.listFilters.status !== "todos" && normalizeStatus(check.status) !== state.listFilters.status) return false;
      if (state.listFilters.checkId !== null && check.id !== state.listFilters.checkId) return false;

      if (!term) return true;

      return (
        normalizeText(check.payee).includes(term) ||
        normalizeText(check.bank).includes(term) ||
        normalizeText(check.checkNumber).includes(term)
      );
    })
    .sort(compareByDateDesc);
}

function statusClass(status) {
  const found = STATUS_OPTIONS.find((opt) => opt.value === normalizeStatus(status));
  return found ? found.className : "status-pendiente";
}

function statusLabel(status) {
  const found = STATUS_OPTIONS.find((opt) => opt.value === normalizeStatus(status));
  return found ? found.label : String(status || "Pendiente");
}

function renderStatusControl(check) {
  const currentStatus = normalizeStatus(check.status);
  const isEditing = state.editingStatusId === check.id;
  const editingValue = isEditing ? state.editingStatusDraft : currentStatus;

  if (!isEditing) {
    return `
      <div class="status-display">
        <span class="status-pill ${statusClass(currentStatus)}">${escapeHtml(statusLabel(currentStatus))}</span>
        <button type="button" class="status-edit-trigger" data-status-edit-open-id="${escapeHtml(check.id)}" title="Editar estado">✎</button>
      </div>
    `;
  }

  return `
    <div class="status-editor">
      <select data-status-edit-select-id="${escapeHtml(check.id)}" class="status-edit-select">
        ${STATUS_OPTIONS.map((opt) => `<option value="${opt.value}" ${opt.value === editingValue ? "selected" : ""}>${opt.label}</option>`).join("")}
      </select>
      <button type="button" class="action-btn share" data-status-edit-save-id="${escapeHtml(check.id)}">Guardar</button>
      <button type="button" class="action-btn photo" data-status-edit-cancel-id="${escapeHtml(check.id)}">Cancelar</button>
    </div>
  `;
}

function renderListView() {
  const rows = getFilteredChecks();
  const hasDateFilter = Boolean(state.listFilters.date);
  const hasStatusFilter = state.listFilters.status !== "todos";
  const hasCheckFilter = Boolean(state.listFilters.checkId);
  const filteredCheck = hasCheckFilter ? state.checks.find((check) => check.id === state.listFilters.checkId) : null;

  return `
    <section>
      <div class="section-head">
        <h1>Historial</h1>
        <p>Busca, filtra y actualiza estados.</p>
      </div>

      <div class="controls">
        <select id="directionFilter">
          <option value="todos" ${state.listFilters.direction === "todos" ? "selected" : ""}>Todos los cheques</option>
          <option value="emitido" ${state.listFilters.direction === "emitido" ? "selected" : ""}>Solo pagos (emitidos)</option>
          <option value="recibido" ${state.listFilters.direction === "recibido" ? "selected" : ""}>Solo cobros (a favor)</option>
        </select>

        <select id="statusFilter">
          <option value="todos" ${state.listFilters.status === "todos" ? "selected" : ""}>Todos los estados</option>
          ${STATUS_OPTIONS.map((opt) => `<option value="${opt.value}" ${state.listFilters.status === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
        </select>

        <div class="search">
          <input id="searchInput" type="text" value="${escapeHtml(state.listFilters.term)}" placeholder="Buscar por banco, contacto..." />
        </div>
      </div>

      ${
        hasDateFilter
          ? `
        <div class="date-filter-banner">
          <div>
            <strong>Mostrando resultados para un día específico</strong>
            <p>Fecha filtrada: ${formatDate(state.listFilters.date)}</p>
          </div>
          <button type="button" class="btn-soft" id="clearDateFilterBtn">Borrar filtro</button>
        </div>
      `
          : ""
      }

      ${
        hasStatusFilter
          ? `
        <div class="date-filter-banner">
          <div>
            <strong>Filtro por estado activo</strong>
            <p>Estado: ${escapeHtml(statusLabel(state.listFilters.status))}</p>
          </div>
          <button type="button" class="btn-soft" id="clearStatusFilterBtn">Quitar</button>
        </div>
      `
          : ""
      }

      ${
        hasCheckFilter
          ? `
        <div class="date-filter-banner">
          <div>
            <strong>Cheque seleccionado</strong>
            <p>${filteredCheck ? `${escapeHtml(filteredCheck.bank)} · Nº ${escapeHtml(filteredCheck.checkNumber)}` : "Cheque puntual"}</p>
          </div>
          <button type="button" class="btn-soft" id="clearCheckFilterBtn">Ver todos</button>
        </div>
      `
          : ""
      }

      <article class="list-box">
        ${
          rows.length
            ? `
          <div class="list-table-wrap scrollbar">
            <table class="list-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Contacto / Banco</th>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (check) => `
                  <tr>
                    <td>
                      <span class="badge ${check.direction === "emitido" ? "up" : "down"}">${check.direction}</span>
                      <span class="badge ${check.type === "echeq" ? "type-echeq" : "type-fisico"}">${check.type}</span>
                    </td>
                    <td>
                      <strong>${escapeHtml(check.payee)}</strong><br />
                      <span class="hint">${escapeHtml(check.bank)} · Nº ${escapeHtml(check.checkNumber)}</span>
                    </td>
                    <td>${formatDate(check.paymentDate)}</td>
                    <td class="amount ${check.direction}">${check.direction === "emitido" ? "-" : "+"}${formatCurrency(check.amount)}</td>
                    <td>${renderStatusControl(check)}</td>
                    <td>
                      <div class="actions">
                        ${check.photoUrl ? `<button type="button" class="action-btn photo" data-photo-id="${escapeHtml(check.id)}">IMG</button>` : ""}
                        <button type="button" class="action-btn share" data-share-id="${escapeHtml(check.id)}">Compartir</button>
                        <button type="button" class="action-btn photo" data-edit-check-id="${escapeHtml(check.id)}">Editar</button>
                        ${check.direction === "emitido" ? `<button type="button" class="action-btn delete" data-delete-id="${escapeHtml(check.id)}">Eliminar</button>` : ""}
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="mobile-cards">
            ${rows
              .map(
                (check) => `
              <article class="mobile-card">
                <div class="mobile-card-row">
                  <div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <span class="badge ${check.direction === "emitido" ? "up" : "down"}">${check.direction}</span>
                      <span class="badge ${check.type === "echeq" ? "type-echeq" : "type-fisico"}">${check.type}</span>
                    </div>
                    <strong style="display:block;margin-top:6px;">${escapeHtml(check.payee)}</strong>
                  </div>
                  <div class="amount ${check.direction}">${check.direction === "emitido" ? "-" : "+"}${formatCurrency(check.amount)}</div>
                </div>
                <div class="mobile-card-meta">${escapeHtml(check.bank)} · Nº ${escapeHtml(check.checkNumber)} · ${formatDate(check.paymentDate)}</div>
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;">
                  ${renderStatusControl(check)}
                  <div class="actions">
                    ${check.photoUrl ? `<button type="button" class="action-btn photo" data-photo-id="${escapeHtml(check.id)}">IMG</button>` : ""}
                    <button type="button" class="action-btn share" data-share-id="${escapeHtml(check.id)}">Compartir</button>
                    <button type="button" class="action-btn photo" data-edit-check-id="${escapeHtml(check.id)}">Editar</button>
                    ${check.direction === "emitido" ? `<button type="button" class="action-btn delete" data-delete-id="${escapeHtml(check.id)}">Eliminar</button>` : ""}
                  </div>
                </div>
              </article>
            `
              )
              .join("")}
          </div>
        `
            : '<div class="panel-body"><div class="empty">No se encontraron cheques para este filtro.</div></div>'
        }
      </article>
    </section>
  `;
}

function calcReportStats(direction) {
  const checks = state.checks.filter((check) => check.direction === direction);
  const totalAmount = checks.reduce((sum, check) => sum + check.amount, 0);
  const totalCount = checks.length;

  const byStatus = STATUS_OPTIONS.map((opt) => {
    const subset = checks.filter((check) => normalizeStatus(check.status) === opt.value);
    return {
      ...opt,
      count: subset.length,
      amount: subset.reduce((sum, check) => sum + check.amount, 0)
    };
  }).filter((item) => item.count > 0);

  return { totalAmount, totalCount, byStatus };
}

function renderReportsView() {
  const emitidos = calcReportStats("emitido");
  const recibidos = calcReportStats("recibido");
  const cubiertos = state.checks.filter((check) => normalizeStatus(check.status) === "cobrado");
  const rebotados = state.checks.filter((check) => normalizeStatus(check.status) === "rebotado");
  const totalCubiertos = cubiertos.reduce((sum, check) => sum + Number(check.amount || 0), 0);
  const totalRebotados = rebotados.reduce((sum, check) => sum + Number(check.amount || 0), 0);

  const card = (title, stats, direction) => `
    <article class="report-box">
      <h3 style="margin-top:0;${direction === "emitido" ? "color:#b91c1c;" : "color:#047857;"}">${title}</h3>
      <div class="report-total">
        <div class="hint">Monto total histórico</div>
        <strong>${formatCurrency(stats.totalAmount)}</strong>
        <div class="hint">${stats.totalCount} cheque(s)</div>
      </div>
      <div>
        ${
          stats.byStatus.length
            ? stats.byStatus
                .map(
                  (status) => `
              <div class="status-row">
                <span>${status.label} (${status.count})</span>
                <strong>${formatCurrency(status.amount)}</strong>
              </div>
            `
                )
                .join("")
            : '<div class="empty">Sin datos.</div>'
        }
      </div>
    </article>
  `;

  const hasRebotes = emitidos.byStatus.some((s) => s.value === "rebotado") || recibidos.byStatus.some((s) => s.value === "rebotado");

  return `
    <section>
      <div class="section-head">
        <h1>Informe de Estados</h1>
        <p>Situación consolidada de cobros y pagos.</p>
      </div>

      <div class="report-quick-grid">
        <button type="button" class="report-quick-btn covered" data-report-status="cobrado">
          <span>Total cheques cubiertos</span>
          <strong>${cubiertos.length}</strong>
          <div class="report-quick-amount">${formatCurrency(totalCubiertos)}</div>
          <small>Ver en lista</small>
        </button>
        <button type="button" class="report-quick-btn bounced" data-report-status="rebotado">
          <span>Total cheques rebotados</span>
          <strong>${rebotados.length}</strong>
          <div class="report-quick-amount">${formatCurrency(totalRebotados)}</div>
          <small>Ver en lista</small>
        </button>
      </div>

      <div class="report-layout">
        ${card("Cheques a Favor (Cobros)", recibidos, "recibido")}
        ${card("Cheques Emitidos (Pagos)", emitidos, "emitido")}
      </div>

      ${
        hasRebotes
          ? '<div class="alert-rebote"><strong>Alerta:</strong> existen cheques en estado rebotado / rechazado. Revisa la vista Historial para gestionar seguimiento.</div>'
          : ""
      }
    </section>
  `;
}

function renderCurrentView() {
  const container = document.getElementById("viewContainer");
  if (!container) return;

  let html = "";
  if (state.currentView === "dashboard") html = renderDashboardView();
  if (state.currentView === "register") html = renderRegisterView();
  if (state.currentView === "calendar") html = renderCalendarView();
  if (state.currentView === "entities") html = renderEntitiesView();
  if (state.currentView === "list") html = renderListView();
  if (state.currentView === "reports") html = renderReportsView();

  container.innerHTML = html;

  if (state.currentView === "dashboard") bindDashboardEvents();
  if (state.currentView === "register") bindRegisterEvents();
  if (state.currentView === "calendar") bindCalendarEvents();
  if (state.currentView === "entities") bindEntitiesEvents();
  if (state.currentView === "list") bindListEvents();
  if (state.currentView === "reports") bindReportsEvents();

  const banner = document.getElementById("statusBanner");
  if (banner) {
    if (state.apiBannerMessage) {
      banner.textContent = state.apiBannerMessage;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
      banner.textContent = "";
    }
  }
}

function bindDashboardEvents() {
  document.querySelectorAll("[data-dashboard-direction]").forEach((card) => {
    card.addEventListener("click", () => {
      setListFilters({
        direction: card.dataset.dashboardDirection || "todos",
        term: "",
        date: card.dataset.dashboardDate || null,
        status: "todos",
        checkId: null
      });
      setView("list");
    });
  });

  const goList = document.getElementById("dashboardGoList");
  if (goList) {
    goList.addEventListener("click", () => {
      resetListFilters();
      setView("list");
    });
  }

  document.querySelectorAll("[data-attention-id]").forEach((item) => {
    item.addEventListener("click", () => {
      setListFilters({
        direction: "todos",
        term: "",
        date: null,
        status: "todos",
        checkId: item.dataset.attentionId || null
      });
      setView("list");
    });
  });
}

function bindReportsEvents() {
  document.querySelectorAll("[data-report-status]").forEach((card) => {
    card.addEventListener("click", () => {
      setListFilters({
        direction: "todos",
        term: "",
        date: null,
        status: card.dataset.reportStatus || "todos",
        checkId: null
      });
      setView("list");
    });
  });
}

function bindSuggestionPicker(form, fieldName, sourceList) {
  const input = form.elements[fieldName];
  const list = form.querySelector(`[data-suggest-list="${sourceList}"]`);
  if (!input || !list) return;

  const getOptions = () => {
    const base = sourceList === "banks" ? state.banks : state.providers;
    const term = normalizeText(input.value);
    const filtered = base.filter((item) => !term || normalizeText(item).includes(term));
    return uniqueStrings(filtered).slice(0, 8);
  };

  const renderOptions = () => {
    const options = getOptions();
    list.innerHTML = options
      .map((option) => `<button type="button" data-suggest-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`)
      .join("");
    list.classList.toggle("hidden", options.length === 0);

    list.querySelectorAll("[data-suggest-value]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        input.value = button.dataset.suggestValue || "";
        list.classList.add("hidden");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  };

  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", renderOptions);
  input.addEventListener("blur", () => {
    window.setTimeout(() => list.classList.add("hidden"), 120);
  });

  renderOptions();
  list.classList.add("hidden");
}

function updateConflictBox() {
  const form = document.getElementById("registerForm");
  if (!form) return;
  const box = document.getElementById("conflictBox");
  if (!box) return;

  const direction = form.elements.direction.value;
  const paymentDate = form.elements.paymentDate.value;
  const amount = parseAmount(form.elements.amount.value);

  if (direction !== "emitido") {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const conflicts = getRegisterConflicts(direction, paymentDate, amount);
  if (!conflicts.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const total = conflicts.reduce((sum, c) => sum + c.amount, 0) + amount;

  box.classList.remove("hidden");
  box.innerHTML = `
    <strong>Atención: ya existen pagos para esa fecha.</strong>
    ${conflicts
      .map(
        (c) => `
      <div class="warning-row">
        <span>${escapeHtml(c.bank)} · ${escapeHtml(c.payee)}</span>
        <strong>${formatCurrency(c.amount)}</strong>
      </div>
    `
      )
      .join("")}
    <div class="warning-row" style="margin-top:8px;">
      <span>Total acumulado con este cheque</span>
      <strong>${formatCurrency(total)}</strong>
    </div>
  `;
}

function updateAmountHint() {
  const form = document.getElementById("registerForm");
  const hint = document.getElementById("amountTextHint");
  if (!form || !hint) return;

  const amount = parseAmount(form.elements.amount.value);
  if (!amount) {
    hint.textContent = "";
    return;
  }

  hint.textContent = numeroALetras(amount);
}

function bindRegisterEvents() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  bindSuggestionPicker(form, "bank", "banks");
  bindSuggestionPicker(form, "payee", "providers");

  const directionButtons = form.querySelectorAll("[data-dir-btn]");
  directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.dirBtn;
      form.elements.direction.value = direction;
      directionButtons.forEach((b) => b.classList.toggle("active", b.dataset.dirBtn === direction));

      const label = document.getElementById("payeeLabel");
      if (label) {
        label.textContent = direction === "emitido" ? "Páguese a (Proveedor)" : "Recibido de (Cliente/Emisor)";
      }

      const quick = document.getElementById("quickDaysWrap");
      if (quick) quick.classList.toggle("hidden", direction !== "emitido");
      updateConflictBox();
    });
  });

  form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const type = form.elements.type.value;
      form.querySelectorAll("[data-type-label]").forEach((label) => {
        label.classList.toggle("active", label.dataset.typeLabel === type);
      });
    });
  });

  form.querySelectorAll("[data-quick-days]").forEach((button) => {
    button.addEventListener("click", () => {
      const issueDate = form.elements.issueDate.value;
      const days = Number(button.dataset.quickDays);
      form.elements.paymentDate.value = addDaysToDate(issueDate, days);
      updateConflictBox();
    });
  });

  form.elements.paymentDate.addEventListener("input", updateConflictBox);
  form.elements.amount.addEventListener("input", () => {
    updateAmountHint();
    updateConflictBox();
  });

  form.elements.issueDate.addEventListener("input", () => {
    if (!form.elements.paymentDate.value) {
      form.elements.paymentDate.value = form.elements.issueDate.value;
    }
    updateConflictBox();
  });

  const photoInput = document.getElementById("photoInput");
  if (photoInput) {
    photoInput.addEventListener("change", () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.registerPhoto = String(reader.result || "");
        state.registerPhotoFile = file;
        resetRegisterPhotoPreview();
      };
      reader.readAsDataURL(file);
    });
  }

  const cancelBtn = document.getElementById("registerCancelBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => setView("dashboard"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fd = new FormData(form);
    const bank = String(fd.get("bank") || "").trim();
    const payee = String(fd.get("payee") || "").trim();
    const rawLocalId = `local-${Date.now()}`;

    const payloadForUpload = {
      bank,
      payee,
      checkNumber: String(fd.get("checkNumber") || ""),
      paymentDate: String(fd.get("paymentDate") || "")
    };

    let photoUrl = state.registerPhoto;
    if (state.registerPhotoFile) {
      const submitBtn = form.querySelector('button[type="submit"]');
      const previousText = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Guardando...";
      }

      try {
        const uploadedUrl = await uploadPhotoToFirebase(state.registerPhotoFile, rawLocalId, payloadForUpload);
        if (uploadedUrl) {
          photoUrl = uploadedUrl;
          showStatus("");
        } else if (!firebaseState.ready) {
          showStatus("Firebase no está configurado: la foto se guardó solo en este dispositivo.");
        }
      } catch (error) {
        photoUrl = state.registerPhoto;
        showStatus(`No se pudo subir la foto a Firebase (${error?.message || "error"}). Se guardó localmente.`);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = previousText || "Guardar cheque";
        }
      }
    }

    const newCheck = sanitizeCheck(
      {
        id: rawLocalId,
        direction: fd.get("direction") || "emitido",
        bank,
        checkNumber: fd.get("checkNumber"),
        amount: fd.get("amount"),
        payee,
        issueDate: fd.get("issueDate"),
        paymentDate: fd.get("paymentDate"),
        status: "pendiente",
        type: fd.get("type") || "fisico",
        photoUrl,
        observacion: ""
      },
      "local",
      state.localChecks.length
    );

    if (bank) state.banks = uniqueStrings([...state.banks, bank]);
    if (payee) state.providers = uniqueStrings([...state.providers, payee]);
    saveEntities();

    let savedRemotely = false;
    try {
      await createCheckRemote(newCheck);
      savedRemotely = true;
      showStatus("");
    } catch (error) {
      savedRemotely = false;
      setApiStatus(isDoPostMissingError(error) ? "API en solo lectura (sin doPost)." : "Error al guardar en API.");
      showStatus(buildLocalOnlySyncMessage("No se pudo guardar en la API compartida.", error));
    }

    if (savedRemotely) {
      state.registerPhoto = null;
      state.registerPhotoFile = null;
      await loadRemoteChecks();
      setView("dashboard");
      return;
    }

    state.localChecks.push(newCheck);
    saveLocalChecks();

    state.registerPhoto = null;
    state.registerPhotoFile = null;
    updateCombinedChecks();
    setView("dashboard");
  });

  updateAmountHint();
  updateConflictBox();
  resetRegisterPhotoPreview();
}

function bindCalendarEvents() {
  const prev = document.getElementById("prevMonthBtn");
  const next = document.getElementById("nextMonthBtn");

  if (prev) {
    prev.addEventListener("click", () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
      renderApp();
    });
  }

  if (next) {
    next.addEventListener("click", () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
      renderApp();
    });
  }

  document.querySelectorAll("[data-calendar-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.calendarDate;
      state.selectedDate = state.selectedDate === date ? null : date;
      renderApp();
    });
  });
}

function bindEntitiesEvents() {
  const providerForm = document.getElementById("providerForm");
  if (providerForm) {
    providerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("newProvider");
      const value = String(input?.value || "").trim();
      if (!value) return;
      state.providers = uniqueStrings([...state.providers, value]);
      saveEntities();
      renderApp();
    });
  }

  const bankForm = document.getElementById("bankForm");
  if (bankForm) {
    bankForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("newBank");
      const value = String(input?.value || "").trim();
      if (!value) return;
      state.banks = uniqueStrings([...state.banks, value]);
      saveEntities();
      renderApp();
    });
  }

  document.querySelectorAll("[data-remove-provider]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.removeProvider;
      state.providers = state.providers.filter((item) => normalizeText(item) !== normalizeText(value));
      saveEntities();
      renderApp();
    });
  });

  document.querySelectorAll("[data-remove-bank]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.removeBank;
      state.banks = state.banks.filter((item) => normalizeText(item) !== normalizeText(value));
      saveEntities();
      renderApp();
    });
  });
}

async function updateCheckStatus(checkId, newStatus) {
  const check = state.checks.find((item) => item.id === checkId);
  if (!check) return;

  if (check.source === "remote") {
    try {
      await updateCheckStatusRemote(check, normalizeStatus(newStatus));
      if (state.statusOverrides[checkId]) {
        delete state.statusOverrides[checkId];
        saveStatusOverrides();
      }
      await loadRemoteChecks();
      return;
    } catch (error) {
      state.statusOverrides[checkId] = normalizeStatus(newStatus);
      saveStatusOverrides();
      setApiStatus(isDoPostMissingError(error) ? "API en solo lectura (sin doPost)." : "Error al guardar en API.");
      showStatus(buildLocalOnlySyncMessage("No se pudo sincronizar el estado en la API.", error));
    }
  } else {
    state.localChecks = state.localChecks.map((item) => {
      if (item.id !== checkId) return item;
      return { ...item, status: normalizeStatus(newStatus) };
    });
    saveLocalChecks();
  }

  updateCombinedChecks();
  renderApp();
}

async function deleteCheck(checkId) {
  const check = state.checks.find((item) => item.id === checkId);
  if (!check) return;

  if (check.source === "remote") {
    try {
      await deleteCheckRemote(check);
      if (state.hiddenRemoteChecks.includes(checkId)) {
        state.hiddenRemoteChecks = state.hiddenRemoteChecks.filter((id) => id !== checkId);
        saveHiddenRemoteChecks();
      }
      if (state.statusOverrides[checkId]) {
        delete state.statusOverrides[checkId];
        saveStatusOverrides();
      }
      await loadRemoteChecks();
      return;
    } catch (error) {
      if (!state.hiddenRemoteChecks.includes(checkId)) {
        state.hiddenRemoteChecks.push(checkId);
        saveHiddenRemoteChecks();
      }
      if (state.statusOverrides[checkId]) {
        delete state.statusOverrides[checkId];
        saveStatusOverrides();
      }
      setApiStatus(isDoPostMissingError(error) ? "API en solo lectura (sin doPost)." : "Error al guardar en API.");
      showStatus(buildLocalOnlySyncMessage("No se pudo eliminar en la API.", error));
    }
  } else {
    state.localChecks = state.localChecks.filter((item) => item.id !== checkId);
    saveLocalChecks();
  }

  updateCombinedChecks();
  renderApp();
}

async function editCheck(checkId) {
  const check = state.checks.find((item) => item.id === checkId);
  if (!check) return;

  const bank = window.prompt("Banco", check.bank);
  if (bank === null) return;
  const checkNumber = window.prompt("Número de cheque", check.checkNumber);
  if (checkNumber === null) return;
  const payee = window.prompt("Contacto / Proveedor", check.payee);
  if (payee === null) return;
  const amountInput = window.prompt("Monto", String(check.amount));
  if (amountInput === null) return;
  const issueDateInput = window.prompt("Fecha de emisión (YYYY-MM-DD)", check.issueDate);
  if (issueDateInput === null) return;
  const paymentDateInput = window.prompt("Fecha de cobro/pago (YYYY-MM-DD)", check.paymentDate);
  if (paymentDateInput === null) return;
  const typeInput = window.prompt("Tipo (fisico o echeq)", check.type);
  if (typeInput === null) return;

  const amount = parseAmount(amountInput);
  if (Number.isNaN(amount) || amount < 0) {
    window.alert("Monto inválido.");
    return;
  }

  const issueDate = toISODate(issueDateInput);
  const paymentDate = toISODate(paymentDateInput);
  if (!issueDate || !paymentDate) {
    window.alert("Formato de fecha inválido. Usá YYYY-MM-DD.");
    return;
  }

  const editedCheck = {
    ...check,
    bank: String(bank || check.bank).trim() || check.bank,
    checkNumber: String(checkNumber || check.checkNumber).trim() || check.checkNumber,
    payee: String(payee || check.payee).trim() || check.payee,
    amount,
    issueDate,
    paymentDate,
    type: normalizeType(typeInput)
  };

  if (check.source === "remote") {
    try {
      await updateCheckRemoteData(editedCheck);
      if (state.hiddenRemoteChecks.includes(check.id)) {
        state.hiddenRemoteChecks = state.hiddenRemoteChecks.filter((id) => id !== check.id);
        saveHiddenRemoteChecks();
      }
      await loadRemoteChecks();
      return;
    } catch (error) {
      setApiStatus(isDoPostMissingError(error) ? "API en solo lectura (sin doPost)." : "Error al guardar en API.");
      showStatus(buildLocalOnlySyncMessage("No se pudo editar en la API.", error));
      return;
    }
  }

  state.localChecks = state.localChecks.map((item) => {
    if (item.id !== checkId) return item;
    return { ...item, ...editedCheck };
  });
  saveLocalChecks();
  updateCombinedChecks();
  renderApp();
}

function shareCheckAsImage(check) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 960, 520);

  ctx.fillStyle = check.direction === "emitido" ? "#ef4444" : "#10b981";
  ctx.fillRect(0, 0, 960, 16);

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 40px sans-serif";
  ctx.fillText("Detalle de Cheque", 48, 78);

  ctx.font = "600 28px sans-serif";
  ctx.fillStyle = "#1e293b";
  ctx.fillText(check.bank, 48, 126);

  ctx.font = "500 24px sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(`Nº ${check.checkNumber}`, 48, 168);

  ctx.fillStyle = "#334155";
  ctx.font = "500 24px sans-serif";
  ctx.fillText(check.direction === "emitido" ? "Pagado a:" : "Recibido de:", 48, 224);

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 34px sans-serif";
  ctx.fillText(check.payee, 48, 270);

  ctx.fillStyle = check.direction === "emitido" ? "#b91c1c" : "#047857";
  ctx.font = "700 52px sans-serif";
  ctx.fillText(`${check.direction === "emitido" ? "-" : "+"}${formatCurrency(check.amount)}`, 48, 352);

  ctx.fillStyle = "#334155";
  ctx.font = "500 22px sans-serif";
  ctx.fillText(`Emisión: ${formatDate(check.issueDate)}`, 48, 404);
  ctx.fillText(`Cobro/Pago: ${formatDate(check.paymentDate)}`, 48, 438);

  ctx.fillText(`Estado: ${STATUS_OPTIONS.find((s) => s.value === normalizeStatus(check.status))?.label || check.status}`, 48, 472);
  ctx.fillText(`Tipo: ${check.type.toUpperCase()}`, 640, 126);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "italic 18px sans-serif";
  ctx.fillText("Generado por E-Flow", 48, 500);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `cheque_${check.checkNumber}.png`, { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: "Detalle de cheque",
          text: `Cheque ${check.checkNumber}`,
          files: [file]
        });
        return;
      } catch {
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cheque_${check.checkNumber}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function bindListEvents() {
  const filterSelect = document.getElementById("directionFilter");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      setListFilters({ direction: filterSelect.value });
      renderApp();
    });
  }

  const statusFilter = document.getElementById("statusFilter");
  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      setListFilters({ status: statusFilter.value });
      renderApp();
    });
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const cursorPos = searchInput.selectionStart;
      setListFilters({ term: searchInput.value });
      renderApp();
      const newInput = document.getElementById("searchInput");
      if (newInput) {
        newInput.focus();
        if (cursorPos !== null) newInput.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }

  const clearDateFilterBtn = document.getElementById("clearDateFilterBtn");
  if (clearDateFilterBtn) {
    clearDateFilterBtn.addEventListener("click", () => {
      setListFilters({ date: null });
      renderApp();
    });
  }

  const clearStatusFilterBtn = document.getElementById("clearStatusFilterBtn");
  if (clearStatusFilterBtn) {
    clearStatusFilterBtn.addEventListener("click", () => {
      setListFilters({ status: "todos" });
      renderApp();
    });
  }

  const clearCheckFilterBtn = document.getElementById("clearCheckFilterBtn");
  if (clearCheckFilterBtn) {
    clearCheckFilterBtn.addEventListener("click", () => {
      setListFilters({ checkId: null });
      renderApp();
    });
  }

  document.querySelectorAll("[data-status-edit-open-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const check = state.checks.find((item) => item.id === button.dataset.statusEditOpenId);
      if (!check) return;
      state.editingStatusId = check.id;
      state.editingStatusDraft = normalizeStatus(check.status);
      renderApp();
    });
  });

  document.querySelectorAll("[data-status-edit-select-id]").forEach((select) => {
    select.addEventListener("change", () => {
      state.editingStatusDraft = select.value;
    });
  });

  document.querySelectorAll("[data-status-edit-cancel-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingStatusId = null;
      renderApp();
    });
  });

  document.querySelectorAll("[data-status-edit-save-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const checkId = button.dataset.statusEditSaveId;
      const newStatus = state.editingStatusDraft || "pendiente";
      button.disabled = true;
      try {
        await updateCheckStatus(checkId, newStatus);
        state.editingStatusId = null;
        state.editingStatusDraft = "pendiente";
        renderApp();
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-share-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const check = state.checks.find((item) => item.id === button.dataset.shareId);
      if (!check) return;
      shareCheckAsImage(check);
    });
  });

  document.querySelectorAll("[data-photo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const check = state.checks.find((item) => item.id === button.dataset.photoId);
      if (!check || !check.photoUrl) return;
      window.open(check.photoUrl, "_blank", "noopener,noreferrer");
    });
  });

  document.querySelectorAll("[data-edit-check-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await editCheck(button.dataset.editCheckId);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const check = state.checks.find((item) => item.id === button.dataset.deleteId);
      if (!check || check.direction !== "emitido") return;
      const target = `${check.bank} · Nº ${check.checkNumber}`;
      const ok = window.confirm(`¿Eliminar cheque emitido?\n${target}`);
      if (!ok) return;
      button.disabled = true;
      try {
        await deleteCheck(check.id);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderApp() {
  const app = document.getElementById("app");
  if (!app || app.classList.contains("hidden")) return;

  const shell = document.getElementById("appShell");
  if (shell) shell.classList.toggle("force-mobile", state.forceMobile);
  const desktopQuickActions = document.getElementById("desktopQuickActions");
  if (desktopQuickActions) desktopQuickActions.classList.toggle("hidden", state.forceMobile);

  const simulatorBtn = document.getElementById("simulatorBtn");
  if (simulatorBtn) {
    simulatorBtn.textContent = state.forceMobile ? "Ver escritorio" : "Simular móvil";
  }

  const mobileSimulatorBtn = document.getElementById("mobileSimulatorBtn");
  if (mobileSimulatorBtn) {
    mobileSimulatorBtn.textContent = state.forceMobile ? "PC" : "Simular";
  }

  renderDesktopNav();
  renderMobileNav();
  renderCurrentView();
}

function login() {
  const key = document.getElementById("clave")?.value || "";
  if (key !== PASSWORD) {
    alert("Clave incorrecta");
    return;
  }

  sessionStorage.setItem("eflow_auth", "ok");
  openApp();
}

function startRemoteAutoRefresh() {
  stopRemoteAutoRefresh();
  if (startFirestoreRealtimeChecks()) return;
  state.remoteRefreshTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (sessionStorage.getItem("eflow_auth") !== "ok") return;
    loadRemoteChecks();
  }, REMOTE_REFRESH_MS);
}

function stopRemoteAutoRefresh() {
  stopFirestoreRealtimeChecks();
  if (state.remoteRefreshTimer) {
    window.clearInterval(state.remoteRefreshTimer);
    state.remoteRefreshTimer = null;
  }
}

function logout() {
  stopRemoteAutoRefresh();
  sessionStorage.removeItem("eflow_auth");
  document.getElementById("app")?.classList.add("hidden");
  document.getElementById("login")?.classList.remove("hidden");
  document.body.classList.add("login-mode");
  const keyInput = document.getElementById("clave");
  if (keyInput) keyInput.value = "";
}

function openApp() {
  document.getElementById("login")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  document.body.classList.remove("login-mode");

  renderApp();
  startRemoteAutoRefresh();
  loadRemoteChecks();
}

function bindGlobalUI() {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) loginBtn.addEventListener("click", login);

  const keyInput = document.getElementById("clave");
  if (keyInput) {
    keyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") login();
    });
  }

  const simulatorBtn = document.getElementById("simulatorBtn");
  if (simulatorBtn) {
    simulatorBtn.addEventListener("click", () => {
      updateForceMobile(!state.forceMobile);
    });
  }

  const mobileSimulatorBtn = document.getElementById("mobileSimulatorBtn");
  if (mobileSimulatorBtn) {
    mobileSimulatorBtn.addEventListener("click", () => {
      updateForceMobile(!state.forceMobile);
    });
  }

  const logoutBtnMobile = document.getElementById("logoutBtnMobile");
  if (logoutBtnMobile) logoutBtnMobile.addEventListener("click", logout);

  const floatingLogoutBtn = document.getElementById("floatingLogoutBtn");
  if (floatingLogoutBtn) floatingLogoutBtn.addEventListener("click", logout);

  const installBtn = document.getElementById("installBtnLogin");
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!state.deferredPrompt) {
        alert("Desde el menú del navegador podés elegir Instalar app / Agregar a pantalla de inicio.");
        return;
      }
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      localStorage.setItem("eflow_installed", "yes");
      installBtn.classList.add("hidden");
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    if (localStorage.getItem("eflow_installed") === "yes") return;
    document.getElementById("installBtnLogin")?.classList.remove("hidden");
  });

  window.addEventListener("resize", () => {
    const isDesktopViewport = window.matchMedia("(min-width: 980px)").matches;
    if (!isDesktopViewport && state.forceMobile) {
      state.forceMobile = false;
      localStorage.setItem(STORAGE.forceMobile, "0");
      renderApp();
    }
  });

  window.addEventListener("focus", () => {
    if (sessionStorage.getItem("eflow_auth") === "ok") {
      loadRemoteChecks();
    }
  });

  window.addEventListener("online", () => {
    if (sessionStorage.getItem("eflow_auth") === "ok") {
      loadRemoteChecks();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sessionStorage.getItem("eflow_auth") === "ok") {
      loadRemoteChecks();
    }
  });
}

function loadLocalState() {
  const storedLocalChecks = readJSONStorage(STORAGE.localChecks, []);
  const storedOverrides = readJSONStorage(STORAGE.statusOverrides, {});
  const storedHiddenRemote = readJSONStorage(STORAGE.hiddenRemoteChecks, []);
  const storedBanks = readJSONStorage(STORAGE.banks, []);
  const storedProviders = readJSONStorage(STORAGE.providers, []);
  const hasStoredBanks = localStorage.getItem(STORAGE.banks) !== null;
  const hasStoredProviders = localStorage.getItem(STORAGE.providers) !== null;
  const forceMobile = localStorage.getItem(STORAGE.forceMobile) === "1";

  state.localChecks = Array.isArray(storedLocalChecks)
    ? storedLocalChecks.map((check, index) => sanitizeCheck(check, "local", index))
    : [];

  state.statusOverrides = typeof storedOverrides === "object" && storedOverrides ? storedOverrides : {};
  state.hiddenRemoteChecks = Array.isArray(storedHiddenRemote) ? storedHiddenRemote.map((id) => String(id)) : [];
  state.banks = hasStoredBanks && Array.isArray(storedBanks) ? uniqueStrings(storedBanks) : uniqueStrings(INITIAL_BANKS);
  state.providers = hasStoredProviders && Array.isArray(storedProviders) ? uniqueStrings(storedProviders) : uniqueStrings(INITIAL_PROVIDERS);
  state.forceMobile = forceMobile;

  updateCombinedChecks();
}

function numeroALetras(num) {
  if (!num || Number.isNaN(num) || num === 0) return "Cero pesos con 00/100";

  const formatCents = (n) => {
    const cents = Math.round((n % 1) * 100);
    return `${cents.toString().padStart(2, "0")}/100`;
  };

  const unidades = (n) => {
    switch (n) {
      case 1:
        return "un";
      case 2:
        return "dos";
      case 3:
        return "tres";
      case 4:
        return "cuatro";
      case 5:
        return "cinco";
      case 6:
        return "seis";
      case 7:
        return "siete";
      case 8:
        return "ocho";
      case 9:
        return "nueve";
      default:
        return "";
    }
  };

  const decenasY = (base, unit) => {
    if (unit > 0) return `${base} y ${unidades(unit)}`;
    return base;
  };

  const decenas = (n) => {
    const ten = Math.floor(n / 10);
    const unit = n - ten * 10;

    switch (ten) {
      case 1:
        switch (unit) {
          case 0:
            return "diez";
          case 1:
            return "once";
          case 2:
            return "doce";
          case 3:
            return "trece";
          case 4:
            return "catorce";
          case 5:
            return "quince";
          default:
            return `dieci${unidades(unit)}`;
        }
      case 2:
        return unit === 0 ? "veinte" : `veinti${unidades(unit)}`;
      case 3:
        return decenasY("treinta", unit);
      case 4:
        return decenasY("cuarenta", unit);
      case 5:
        return decenasY("cincuenta", unit);
      case 6:
        return decenasY("sesenta", unit);
      case 7:
        return decenasY("setenta", unit);
      case 8:
        return decenasY("ochenta", unit);
      case 9:
        return decenasY("noventa", unit);
      default:
        return unidades(unit);
    }
  };

  const centenas = (n) => {
    const hundred = Math.floor(n / 100);
    const rest = n - hundred * 100;

    switch (hundred) {
      case 1:
        return rest > 0 ? `ciento ${decenas(rest)}` : "cien";
      case 2:
        return `doscientos ${decenas(rest)}`;
      case 3:
        return `trescientos ${decenas(rest)}`;
      case 4:
        return `cuatrocientos ${decenas(rest)}`;
      case 5:
        return `quinientos ${decenas(rest)}`;
      case 6:
        return `seiscientos ${decenas(rest)}`;
      case 7:
        return `setecientos ${decenas(rest)}`;
      case 8:
        return `ochocientos ${decenas(rest)}`;
      case 9:
        return `novecientos ${decenas(rest)}`;
      default:
        return decenas(rest);
    }
  };

  const seccion = (n, divisor, singular, plural) => {
    const amount = Math.floor(n / divisor);
    if (amount <= 0) return "";
    if (amount === 1) return singular;
    return `${centenas(amount)} ${plural}`;
  };

  const miles = (n) => {
    const divisor = 1000;
    const main = Math.floor(n / divisor);
    const rest = n - main * divisor;
    const text = seccion(n, divisor, "mil", "mil");
    const textRest = centenas(rest);
    if (!text) return textRest;
    return `${text} ${textRest}`.trim();
  };

  const millones = (n) => {
    const divisor = 1000000;
    const main = Math.floor(n / divisor);
    const rest = n - main * divisor;
    const text = seccion(n, divisor, "un millón", "millones");
    const textRest = miles(rest);
    if (!text) return textRest;
    return `${text} ${textRest}`.trim();
  };

  const integer = Math.floor(num);
  const text = millones(integer) || "cero";
  const cents = formatCents(num);

  return `${text.charAt(0).toUpperCase()}${text.slice(1)} pesos con ${cents}`;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
  });
}

window.addEventListener("load", () => {
  loadLocalState();
  bindGlobalUI();
  initFirebase();

  if (localStorage.getItem("eflow_installed") === "yes") {
    document.getElementById("installBtnLogin")?.classList.add("hidden");
  }

  if (sessionStorage.getItem("eflow_auth") === "ok") {
    openApp();
  } else {
    document.body.classList.add("login-mode");
  }
});
