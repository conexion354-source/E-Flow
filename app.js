
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const API = "https://script.google.com/macros/s/AKfycbwYmaNspP52vbtdmq1Qq7s1tJ-UgLoZo2gT7INuA1NwEvG1Jn1k8Tfk2X2Hb9vb05OlbQ/exec";
const PASSWORD = "1234nn";
const firebaseConfig = {
  apiKey: "AIzaSyD1s9NUDbZlfOx3DD6Q7t19qZjrDQ5NFek",
  authDomain: "e-flow-96cdc.firebaseapp.com",
  projectId: "e-flow-96cdc",
  storageBucket: "e-flow-96cdc.firebasestorage.app",
  messagingSenderId: "876330685560",
  appId: "1:876330685560:web:66770d640c34c8565ac98d"
};
const vapidKey = "BJPiBAt0NvyeP-FKrxRI0EenUNzofBRWD3cvfzOJF-dakOG_0VX-n5G2MfzbfCg8UzdBkkJgmyHmojBNpwdh0EU";

let masterDatos = [];
let filteredDatos = [];
let deferredPrompt = null;
let currentFilter = "a_pagar_all";
let currentMonth = null;
let messaging = null;
let messagingSupported = false;
const app = initializeApp(firebaseConfig);

function normalizeStatus(v){ return String(v || "").trim().toLowerCase(); }
function parseAmount(value) {
  const cleaned = String(value ?? "").replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
function parseDateSafe(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const p = s.split("/");
  if (p.length === 3) { const [d,m,y] = p.map(Number); return new Date(y,m-1,d); }
  const f = new Date(s); return isNaN(f) ? null : f;
}
function formatMoney(value) { return "$ " + Number(value || 0).toLocaleString("es-AR", {maximumFractionDigits: 2}); }
function setLoginMode(enabled){ document.body.classList.toggle("login-mode", enabled); }
function setApiStatus(text){ const el = document.getElementById("apiStatusText"); if(el) el.textContent = text; }

function showStatus(message){
  const banner = document.getElementById("statusBanner");
  const apiText = document.getElementById("apiStatusText");
  if(!banner || !apiText) return;
  if(!message){ banner.classList.add("hidden"); apiText.textContent = "Conectado correctamente."; return; }
  banner.textContent = message;
  banner.classList.remove("hidden");
  apiText.textContent = message;
}

function openApp(){
  const login = document.getElementById("login");
  const appEl = document.getElementById("app");
  if(login) login.classList.add("hidden");
  if(appEl) appEl.classList.remove("hidden");
  setLoginMode(false);
  if(!masterDatos.length) cargar();
}
window.login = function login(){
  const claveEl = document.getElementById("clave");
  const clave = claveEl ? claveEl.value : "";
  if(clave !== PASSWORD){ alert("Clave incorrecta"); return; }
  sessionStorage.setItem("eflow_auth","ok");
  openApp();
}
window.logout = function logout(){
  sessionStorage.removeItem("eflow_auth");
  const appEl = document.getElementById("app");
  const login = document.getElementById("login");
  if(appEl) appEl.classList.add("hidden");
  if(login) login.classList.remove("hidden");
  setLoginMode(true);
  const claveEl = document.getElementById("clave");
  if(claveEl) claveEl.value = "";
  window.scrollTo(0,0);
}

async function cargar(){
  try{
    const r = await fetch(API + "?t=" + Date.now(), {cache:"no-store"});
    const data = JSON.parse(await r.text());
    if(!Array.isArray(data)) throw new Error(data?.error || "La API no devolvió una lista.");
    masterDatos = data;
    const aPagar = data.filter(x => normalizeStatus(x.estado) === "a pagar");
    if(!currentMonth){
      const first = aPagar.find(x => parseDateSafe(x.fechaPago));
      currentMonth = first ? new Date(parseDateSafe(first.fechaPago).getFullYear(), parseDateSafe(first.fechaPago).getMonth(), 1) : new Date();
    }
    applyFilter(currentFilter, false);
    showStatus(aPagar.length ? "" : "La API responde, pero no hay registros con estado 'A Pagar'.");
    checkLocalNotifications();
  }catch(e){
    masterDatos = []; filteredDatos = [];
    renderAll();
    showStatus("No se pudieron cargar los datos. Forzá recarga con Ctrl + Shift + R o reinstalá la app.");
  }
}
function diffDays(fecha){
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((fecha - now)/86400000);
}
function filterByType(data, filter){
  if(filter === "a_pagar_all") return data.filter(x => normalizeStatus(x.estado) === "a pagar");
  if(filter === "rechazados") return data.filter(x => normalizeStatus(x.estado) === "rechazado");
  if(filter === "anulados") return data.filter(x => normalizeStatus(x.estado) === "anulado");
  return data.filter(x => {
    if(normalizeStatus(x.estado) !== "a pagar") return false;
    const fecha = parseDateSafe(x.fechaPago);
    if(!fecha) return false;
    const diff = diffDays(fecha);
    if(filter === "green") return diff >= 30;
    if(filter === "yellow") return diff < 15 && diff >= 5;
    if(filter === "orange") return diff < 5 && diff > 1;
    if(filter === "red") return diff <= 1;
    return true;
  });
}
function applyFilter(filter, goToCheques=true){
  currentFilter = filter;
  filteredDatos = filterByType(masterDatos, filter);
  renderAll();
  const titles = {
    a_pagar_all:["Cheques a pagar","Listado detallado"],
    green:["Cheques de más de 30 días","Listado detallado"],
    yellow:["Cheques de menos de 15 días","Listado detallado"],
    orange:["Cheques de menos de 5 días","Listado detallado"],
    red:["Cheques de 1 día o hoy","Listado detallado"],
    rechazados:["Rechazados","Listado de cheques rechazados"],
    anulados:["Anulados","Listado de cheques anulados"]
  };
  const t = document.getElementById("chequesTitle");
  const s = document.getElementById("chequesSubtitle");
  if(t) t.textContent = titles[filter][0];
  if(s) s.textContent = titles[filter][1];
  if(goToCheques) switchToView("chequesView");
}
function renderAll(){
  renderPanel();
  renderCalendarioMensual();
  renderCheques();
}
function renderPanel(){
  const aPagar = filterByType(masterDatos, "a_pagar_all");
  const rechazados = filterByType(masterDatos, "rechazados");
  const anulados = filterByType(masterDatos, "anulados");
  let total=0, green=0, yellow=0, orange=0, red=0;

  aPagar.forEach(c=>{
    total += parseAmount(c.monto);
    const fecha = parseDateSafe(c.fechaPago); if(!fecha) return;
    const diff = diffDays(fecha);
    if(diff <= 1){ red++; }
    else if(diff < 5){ orange++; }
    else if(diff < 15){ yellow++; }
    else if(diff >= 30){ green++; }
  });

  const ids = [["total", formatMoney(total)],["cantidad", aPagar.length],["greenCount", green],["yellowCount", yellow],["orangeCount", orange],["redCount", red]];
  ids.forEach(([id,val])=>{ const el = document.getElementById(id); if(el) el.textContent = val; });

  renderMiniList("rechazadosList", rechazados, "rechazados");
  const rc = document.getElementById("rechazadosCount"); if(rc) rc.textContent = rechazados.length;
  renderMiniList("anuladosList", anulados, "anulados");
  const ac = document.getElementById("anuladosCount"); if(ac) ac.textContent = anulados.length;
}
function renderMiniList(id, items, filter){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = "";
  if(!items.length){
    el.innerHTML = '<div class="mini-item">Sin registros</div>';
    return;
  }
  items.forEach(c=>{
    const d = document.createElement("div");
    d.className = "mini-item";
    const obs = String(c.observacion || "").trim();
    d.innerHTML = `<strong>${c.proveedor || "-"}</strong><br><span>Emisión: ${c.fechaSalida || "-"} · Pago: ${c.fechaPago || "-"} · ${c.banco || "-"} · ${c.tipo || "-"} · ${c.numeroCheque || "-"} · ${formatMoney(parseAmount(c.monto))}${obs ? " · " + obs : ""}</span>`;
    d.addEventListener("click", ()=>{
      filteredDatos = [c];
      const t = document.getElementById("chequesTitle");
      const s = document.getElementById("chequesSubtitle");
      if(t) t.textContent = filter === "rechazados" ? "Detalle rechazado" : "Detalle anulado";
      if(s) s.textContent = "Vista individual del cheque";
      renderCheques();
      switchToView("chequesView");
    });
    el.appendChild(d);
  });
}
function renderCalendarioMensual(){
  const grid = document.getElementById("calendarGrid");
  const detail = document.getElementById("calendarDayDetail");
  const monthTitle = document.getElementById("monthTitle");
  if(!grid || !detail || !monthTitle) return;
  grid.innerHTML = "";
  detail.innerHTML = "";

  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  monthTitle.textContent = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].forEach(d=>{
    const head = document.createElement("div");
    head.className = "cal-head";
    head.textContent = d;
    grid.appendChild(head);
  });

  const aPagar = filterByType(masterDatos, "a_pagar_all");
  const map = {};
  aPagar.forEach(c=>{
    const fecha = parseDateSafe(c.fechaPago);
    if(!fecha) return;
    if(fecha.getMonth() !== currentMonth.getMonth() || fecha.getFullYear() !== currentMonth.getFullYear()) return;
    const day = fecha.getDate();
    if(!map[day]) map[day] = {cant:0,monto:0,items:[], minDiff:999};
    map[day].cant += 1;
    map[day].monto += parseAmount(c.monto);
    map[day].items.push(c);
    map[day].minDiff = Math.min(map[day].minDiff, diffDays(fecha));
  });

  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 0);
  let weekday = firstDay.getDay(); weekday = weekday === 0 ? 7 : weekday;
  for(let i=1;i<weekday;i++){
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    grid.appendChild(empty);
  }

  for(let day=1; day<=lastDay.getDate(); day++){
    const info = map[day];
    const cell = document.createElement("button");
    cell.className = "cal-day";
    cell.type = "button";
    if(info){
      const d = info.minDiff;
      if(d <= 1) cell.classList.add("high");
      else if(d < 5) cell.classList.add("orangelevel");
      else if(d < 15) cell.classList.add("medium");
      else cell.classList.add("low");
      cell.innerHTML = `<div class="cal-num">${day}</div><div class="cal-meta">${info.cant} chq<br>${formatMoney(info.monto)}</div>`;
      cell.addEventListener("click", ()=>{
        filteredDatos = info.items;
        const t = document.getElementById("chequesTitle");
        const s = document.getElementById("chequesSubtitle");
        if(t) t.textContent = `Cheques del ${day}/${currentMonth.getMonth()+1}/${currentMonth.getFullYear()}`;
        if(s) s.textContent = "Vista detallada del día";
        renderCheques();
        detail.innerHTML = `<strong>${day}/${currentMonth.getMonth()+1}/${currentMonth.getFullYear()}</strong><p class="meta">${info.cant} cheque${info.cant>1?"s":""} · Total ${formatMoney(info.monto)}</p>`;
        switchToView("chequesView");
      });
    } else {
      cell.innerHTML = `<div class="cal-num">${day}</div>`;
    }
    grid.appendChild(cell);
  }
}
function renderCheques(){
  const lista = document.getElementById("lista");
  if(!lista) return;
  lista.innerHTML = "";
  if(!filteredDatos.length){
    lista.innerHTML = '<article class="cheque"><div class="prov">No hay cheques para mostrar</div><div class="meta">No hay registros para este filtro.</div></article>';
    return;
  }
  [...filteredDatos].sort((a,b)=>{
    const da = parseDateSafe(a.fechaPago), db = parseDateSafe(b.fechaPago);
    return (da || 0) - (db || 0);
  }).forEach((c, index)=>{
    const fecha = parseDateSafe(c.fechaPago);
    let cls = "safe", txt = "";
    if(fecha){
      const diff = diffDays(fecha);
      if(diff <= 1){ cls = "today"; txt = "Hoy / 1 día"; }
      else if(diff < 5){ cls = "near"; txt = "Menos de 5 días"; }
      else if(diff < 15){ cls = "warn"; txt = "Menos de 15 días"; }
      else if(diff >= 30){ cls = "safe"; txt = "30+ días"; }
      else { cls = "safe"; txt = `${diff} días`; }
    }
    const obs = String(c.observacion || "").trim();
    const div = document.createElement("article");
    div.className = "cheque " + cls;
    div.dataset.chequeIndex = String(index);
    div.innerHTML = `
      <div class="row">
        <div class="prov">${c.proveedor || "-"}</div>
        <div class="amount">${formatMoney(parseAmount(c.monto))}</div>
      </div>
      <div class="meta">
        Fecha de emisión: ${c.fechaSalida || "-"}<br>
        Proveedor: ${c.proveedor || "-"}<br>
        Fecha de pago: ${c.fechaPago || "-"}<br>
        Banco: ${c.banco || "-"}<br>
        Número de cheque: ${c.numeroCheque || "-"}<br>
        Tipo: ${c.tipo || "-"}<br>
        Monto: ${formatMoney(parseAmount(c.monto))}<br>
        Estado: ${c.estado || "-"} · ${txt}${obs ? "<br>Observaciones: " + obs : ""}
      </div>
      <div class="detail-actions">
        <button class="share-btn" type="button">Compartir imagen</button>
      </div>
    `;
        if(shareBtn) shareBtn.addEventListener("click", ()=> shareChequeCard(div));
    lista.appendChild(div);
  });
}
function applySearch(text){
  const q = text.toLowerCase().trim();
  filteredDatos = filterByType(masterDatos, currentFilter).filter(c =>
    String(c.proveedor || "").toLowerCase().includes(q) ||
    String(c.banco || "").toLowerCase().includes(q) ||
    String(c.numeroCheque || "").toLowerCase().includes(q) ||
    String(c.tipo || "").toLowerCase().includes(q) ||
    String(c.estado || "").toLowerCase().includes(q)
  );
  renderCheques();
}
async function shareChequeCard(card){
  try{
    if(!card) throw new Error("No se encontró el detalle del cheque.");
    const capture = card.cloneNode(true);
    const actions = capture.querySelector(".detail-actions");
    if(actions) actions.remove();
    capture.classList.add("cheque-capture");
    capture.style.width = "720px";
    capture.style.maxWidth = "720px";
    capture.style.position = "fixed";
    capture.style.left = "-99999px";
    capture.style.top = "0";
    capture.style.zIndex = "9999";
    document.body.appendChild(capture);
    const canvas = await html2canvas(capture, {backgroundColor:"#ffffff", scale:2});
    document.body.removeChild(capture);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if(!blob) throw new Error("No se pudo crear la imagen.");
    const file = new File([blob], "detalle-cheque.png", {type:"image/png"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:"Detalle de cheque", text:"Detalle de cheque - E-Flow"});
    }else{
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "detalle-cheque.png";
      a.click();
      URL.revokeObjectURL(url);
      alert("Tu navegador no permite compartir imagen directo. Se descargó la captura.");
    }
  }catch(e){
    alert("No se pudo compartir el detalle. " + (e?.message || e));
  }
}
function openChequeInNewTab(card){
  try{
    if(!card) throw new Error("No se encontró el cheque.");
    const clone = card.cloneNode(true);
    const actions = clone.querySelector(".detail-actions");
    if(actions) actions.remove();
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Detalle de cheque</title><style>body{margin:0;padding:24px;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#111827}.wrap{max-width:760px;margin:0 auto}.cheque{background:#fff;border-radius:18px;padding:14px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(17,24,39,.08)}.prov{font-weight:800;font-size:18px}.amount{font-weight:800;color:#059669;font-size:18px}.row{display:flex;justify-content:space-between;gap:10px}.meta{margin-top:8px;color:#4b5563;font-size:14px;line-height:1.6}</style></head><body><div class="wrap">${clone.outerHTML}</div></body></html>`;
    const w = window.open("", "_blank");
    if(!w) throw new Error("El navegador bloqueó la nueva pestaña.");
    w.document.open(); w.document.write(html); w.document.close();
  }catch(e){
    alert("No se pudo abrir el detalle. " + (e?.message || e));
  }
}
async function initPush(){
  try{
    if(!("serviceWorker" in navigator)){
      setApiStatus("Push no disponible: este navegador no soporta service workers.");
      return;
    }
    messagingSupported = await isSupported().catch(() => false);
    if(!messagingSupported){
      setApiStatus("Push no disponible: Firebase Messaging no es compatible en este navegador.");
      return;
    }
    messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      const title = payload?.notification?.title || "E-Flow";
      const body = payload?.notification?.body || "Nueva alerta";
      alert(title + "\\n" + body);
    });
    const existingToken = localStorage.getItem("eflow_push_token");
    const tokenBox = document.getElementById("pushToken");
    if(existingToken && tokenBox) tokenBox.value = existingToken;
  }catch(e){
    setApiStatus("Error iniciando Firebase Push: " + (e?.message || e));
  }
}
async function requestNotifications(){
  const tokenBox = document.getElementById("pushToken");
  if(tokenBox) tokenBox.value = "";
  try{
    if(!("serviceWorker" in navigator)) throw new Error("Este navegador no soporta service workers.");
    if(!messagingSupported || !messaging) throw new Error("Firebase Messaging no está disponible en este navegador.");
    const permission = await Notification.requestPermission();
    if(permission !== "granted") throw new Error("Permiso de notificaciones denegado.");
    const swRegistration = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
    if(!token) throw new Error("Firebase no devolvió token.");
    localStorage.setItem("eflow_notifications", "on");
    localStorage.setItem("eflow_push_token", token);
    if(tokenBox) tokenBox.value = token;
    hideNotificationButtons();
    setApiStatus("Push activado correctamente. Token generado.");
    alert("Notificaciones push activadas correctamente.");
  }catch(e){
    const msg = e?.message || String(e);
    setApiStatus("Error Firebase Push: " + msg);
    alert("No se pudo activar Firebase Push.\n\nDetalle: " + msg);
    console.error("Firebase Push error:", e);
  }
}
function checkLocalNotifications(){
  if(!("Notification" in window) || Notification.permission !== "granted") return;
  const aPagar = filterByType(masterDatos, "a_pagar_all");
  const dueNow = aPagar.filter(c=>{ const fecha = parseDateSafe(c.fechaPago); return fecha && diffDays(fecha) <= 1; });
  if(dueNow.length && !localStorage.getItem("eflow_demo_notified")){
    new Notification("E-Flow", { body: `Tenés ${dueNow.length} cheques para hoy o 1 día.` });
    localStorage.setItem("eflow_demo_notified", "1");
  }
}
function hideInstallButtons(){
  const el = document.getElementById("installBtnLogin");
  if(el) el.classList.add("hidden");
}
function hideNotificationButtons(){
  const a = document.getElementById("notifyCard"); if(a) a.classList.add("hidden");
  const b = document.getElementById("notifyConfigRow"); if(b) b.classList.add("hidden");
}
function switchToView(view){
  document.querySelectorAll(".menu-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const viewEl = document.getElementById(view);
  if(viewEl) viewEl.classList.add("active");
  const btn = document.querySelector(`.menu-item[data-view="${view}"]`);
  if(btn) btn.classList.add("active");
  window.scrollTo({top:0, behavior:"smooth"});
}
function toggleStatusGroup(type){
  const list = document.getElementById(type + "List");
  const plus = document.getElementById(type + "Plus");
  if(!list || !plus) return;
  const open = list.classList.contains("collapsed");
  list.classList.toggle("collapsed");
  plus.textContent = open ? "−" : "+";
}
window.toggleStatusGroup = toggleStatusGroup;

function bindUI(){
  const loginBtn = document.getElementById("loginBtn");
  if(loginBtn) loginBtn.addEventListener("click", window.login);
  const claveInput = document.getElementById("clave");
  if(claveInput) claveInput.addEventListener("keydown", (e)=>{ if(e.key === "Enter"){ e.preventDefault(); window.login(); } });

  document.querySelectorAll(".menu-item").forEach(btn=> btn.addEventListener("click", ()=> switchToView(btn.dataset.view)));
  document.querySelectorAll(".tappable").forEach(btn=> btn.addEventListener("click", ()=> applyFilter(btn.dataset.filter, true)));
  document.querySelectorAll("[data-toggle-group]").forEach(btn=> btn.addEventListener("click", ()=> toggleStatusGroup(btn.dataset.toggleGroup)));

  const prev = document.getElementById("prevMonth");
  if(prev) prev.addEventListener("click", ()=>{ currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1); renderCalendarioMensual(); });
  const next = document.getElementById("nextMonth");
  if(next) next.addEventListener("click", ()=>{ currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1); renderCalendarioMensual(); });

  const notifyBtn = document.getElementById("notifyBtn");
  if(notifyBtn) notifyBtn.addEventListener("click", requestNotifications);
  const notifyBtnInside = document.getElementById("notifyBtnInside");
  if(notifyBtnInside) notifyBtnInside.addEventListener("click", requestNotifications);

  const copyTokenBtn = document.getElementById("copyTokenBtn");
  if(copyTokenBtn) copyTokenBtn.addEventListener("click", async ()=>{
    const tokenEl = document.getElementById("pushToken");
    const token = tokenEl ? tokenEl.value.trim() : "";
    if(!token) return alert("Todavía no hay token.");
    await navigator.clipboard.writeText(token);
    alert("Token copiado.");
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn) logoutBtn.addEventListener("click", window.logout);

  const installBtnLogin = document.getElementById("installBtnLogin");
  if(installBtnLogin) installBtnLogin.addEventListener("click", installApp);

  const buscar = document.getElementById("buscar");
  if(buscar) buscar.addEventListener("input", (e)=> applySearch(e.target.value));
}

window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  deferredPrompt = e;
  if(localStorage.getItem("eflow_installed") === "yes") return;
  const installBtnLogin = document.getElementById("installBtnLogin");
  if(installBtnLogin) installBtnLogin.classList.remove("hidden");
});
async function installApp(){
  if(!deferredPrompt){
    alert("Si no aparece el instalador automático, abrí el menú del navegador y elegí Instalar app o Agregar a pantalla de inicio.");
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  localStorage.setItem("eflow_installed", "yes");
  hideInstallButtons();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.error("SW general error:", e));
}

window.addEventListener("load", async ()=>{
  bindUI();
  await initPush();
  const storedToken = localStorage.getItem("eflow_push_token");
  const tokenBox = document.getElementById("pushToken");
  if(storedToken && tokenBox) tokenBox.value = storedToken;
  if(localStorage.getItem("eflow_installed") === "yes") hideInstallButtons();
  if(localStorage.getItem("eflow_notifications") === "on" || ("Notification" in window && Notification.permission === "granted")) hideNotificationButtons();
  if(sessionStorage.getItem("eflow_auth") === "ok") openApp();
  else setLoginMode(true);
});
