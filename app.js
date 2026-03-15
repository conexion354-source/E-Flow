import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const API = "https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec";
const PASSWORD = "1234nn";
const firebaseConfig = {
  apiKey: "AIzaSyD1s9NUDbZLfOx3DD6Q7t19qZjrdQ5NFek",
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

function showStatus(message){
  const banner = document.getElementById("statusBanner");
  const apiText = document.getElementById("apiStatusText");
  if(!message){ banner.classList.add("hidden"); apiText.textContent = "Conectado correctamente."; return; }
  banner.textContent = message; banner.classList.remove("hidden"); apiText.textContent = message;
}
window.login = function login(){
  const clave = document.getElementById("clave").value;
  if(clave !== PASSWORD){ alert("Clave incorrecta"); return; }
  sessionStorage.setItem("eflow_auth","ok"); openApp();
}
function openApp(){
  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  setLoginMode(false);
  if(!masterDatos.length) cargar();
}
window.logout = function logout(){
  sessionStorage.removeItem("eflow_auth");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login").classList.remove("hidden");
  setLoginMode(true);
  document.getElementById("clave").value = "";
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
    green:["Cheques verdes","30 días o más"],
    yellow:["Cheques amarillos","Menos de 15 días"],
    orange:["Cheques naranjas","Menos de 5 días"],
    red:["Cheques rojos","Hoy o 1 día"],
    rechazados:["Rechazados","Listado de cheques rechazados"],
    anulados:["Anulados","Listado de cheques anulados"]
  };
  document.getElementById("chequesTitle").textContent = titles[filter][0];
  document.getElementById("chequesSubtitle").textContent = titles[filter][1];
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
    const monto = parseAmount(c.monto); total += monto;
    const fecha = parseDateSafe(c.fechaPago); if(!fecha) return;
    const diff = diffDays(fecha);
    if(diff <= 1){ red++; }
    else if(diff < 5){ orange++; }
    else if(diff < 15){ yellow++; }
    else if(diff >= 30){ green++; }
  });

  document.getElementById("total").textContent = formatMoney(total);
  document.getElementById("cantidad").textContent = aPagar.length;
  document.getElementById("greenCount").textContent = green;
  document.getElementById("yellowCount").textContent = yellow;
  document.getElementById("orangeCount").textContent = orange;
  document.getElementById("redCount").textContent = red;

  renderMiniList("rechazadosList", rechazados, "rechazados");
  document.getElementById("rechazadosCount").textContent = rechazados.length;
  renderMiniList("anuladosList", anulados, "anulados");
  document.getElementById("anuladosCount").textContent = anulados.length;
}
function renderMiniList(id, items, filter){
  const el = document.getElementById(id);
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
      document.getElementById("chequesTitle").textContent = filter === "rechazados" ? "Detalle rechazado" : "Detalle anulado";
      document.getElementById("chequesSubtitle").textContent = "Vista individual del cheque";
      renderCheques();
      switchToView("chequesView");
    });
    el.appendChild(d);
  });
}
function renderCalendarioMensual(){
  const grid = document.getElementById("calendarGrid");
  const detail = document.getElementById("calendarDayDetail");
  grid.innerHTML = "";
  detail.innerHTML = "";

  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  document.getElementById("monthTitle").textContent = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

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
    if(info){
      const d = info.minDiff;
      if(d <= 1) cell.classList.add("high");
      else if(d < 5) cell.classList.add("orangelevel");
      else if(d < 15) cell.classList.add("medium");
      else cell.classList.add("low");
      cell.innerHTML = `<div class="cal-num">${day}</div><div class="cal-meta">${info.cant} chq<br>${formatMoney(info.monto)}</div>`;
      cell.addEventListener("click", ()=>{
        filteredDatos = info.items;
        document.getElementById("chequesTitle").textContent = `Cheques del ${day}/${currentMonth.getMonth()+1}/${currentMonth.getFullYear()}`;
        document.getElementById("chequesSubtitle").textContent = "Vista detallada del día";
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
  lista.innerHTML = "";
  if(!filteredDatos.length){
    lista.innerHTML = '<article class="cheque"><div class="prov">No hay cheques para mostrar</div><div class="meta">No hay registros para este filtro.</div></article>';
    return;
  }
  [...filteredDatos].sort((a,b)=>{
    const da = parseDateSafe(a.fechaPago), db = parseDateSafe(b.fechaPago);
    return (da || 0) - (db || 0);
  }).forEach(c=>{
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
    `;
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

async function shareChequeCard(button){
  try{
    const card = button.closest(".cheque");
    if(!card) throw new Error("No se encontró el detalle del cheque.");
    const capture = card.cloneNode(true);
    const btn = capture.querySelector(".share-btn");
    if(btn) btn.remove();
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

async function initPush(){
  const supported = await isSupported().catch(() => false);
  if(!supported){
    document.getElementById("apiStatusText").textContent = "Este navegador no soporta Firebase Messaging web.";
    return;
  }
  messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    const title = payload?.notification?.title || "E-Flow";
    const body = payload?.notification?.body || "Nueva alerta";
    alert(title + "\n" + body);
  });
}
async function requestNotifications(){
  if(!messaging){
    alert("Firebase Messaging no está disponible en este navegador.");
    return;
  }
  try{
    const permission = await Notification.requestPermission();
    if(permission !== "granted"){
      alert("No se activaron las notificaciones.");
      return;
    }
    const registration = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if(!token){
      alert("No se pudo generar el token push.");
      return;
    }
    localStorage.setItem("eflow_notifications", "on");
    localStorage.setItem("eflow_push_token", token);
    document.getElementById("pushToken").value = token;
    hideNotificationButtons();
    alert("Notificaciones push activadas. Ya podés copiar el token del dispositivo desde Config y usar el script incluido en el ZIP para automatizar avisos.");
  }catch(e){
    alert("No se pudo activar Firebase Push.");
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
  document.getElementById("installCard").classList.add("hidden");
  document.getElementById("installConfigRow").classList.add("hidden");
  document.getElementById("installBtnLogin").classList.add("hidden");
}
function hideNotificationButtons(){
  document.getElementById("notifyCard").classList.add("hidden");
  document.getElementById("notifyConfigRow").classList.add("hidden");
}
function switchToView(view){
  document.querySelectorAll(".menu-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(view).classList.add("active");
  const btn = document.querySelector(`.menu-item[data-view="${view}"]`);
  if(btn) btn.classList.add("active");
  window.scrollTo({top:0, behavior:"smooth"});
}
window.shareChequeCard = shareChequeCard;

window.toggleStatusGroup = function toggleStatusGroup(type){
  const list = document.getElementById(type + "List");
  const plus = document.getElementById(type + "Plus");
  const open = list.classList.contains("collapsed");
  list.classList.toggle("collapsed");
  plus.textContent = open ? "−" : "+";
};

document.addEventListener("input", e=>{
  if(e.target.id === "buscar") applySearch(e.target.value);
});
document.querySelectorAll(".menu-item").forEach(btn=>{
  btn.addEventListener("click", ()=> switchToView(btn.dataset.view));
});
document.querySelectorAll(".tappable").forEach(btn=>{
  btn.addEventListener("click", ()=> applyFilter(btn.dataset.filter, true));
});
document.getElementById("prevMonth").addEventListener("click", ()=>{
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1);
  renderCalendarioMensual();
});
document.getElementById("nextMonth").addEventListener("click", ()=>{
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1);
  renderCalendarioMensual();
});
window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  deferredPrompt = e;
  if(localStorage.getItem("eflow_installed") === "yes") return;
  ["installBtnTop","installBtnInside","installBtnLogin"].forEach(id => document.getElementById(id).classList.remove("hidden"));
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
document.getElementById("installBtnTop").addEventListener("click", installApp);
document.getElementById("installBtnInside").addEventListener("click", installApp);
document.getElementById("installBtnLogin").addEventListener("click", installApp);
document.getElementById("notifyBtn").addEventListener("click", requestNotifications);
document.getElementById("notifyBtnInside").addEventListener("click", requestNotifications);
document.getElementById("copyTokenBtn").addEventListener("click", async ()=>{
  const token = document.getElementById("pushToken").value.trim();
  if(!token) return alert("Todavía no hay token.");
  await navigator.clipboard.writeText(token);
  alert("Token copiado.");
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
window.addEventListener("load", async ()=>{
  await initPush();
  const storedToken = localStorage.getItem("eflow_push_token");
  if(storedToken) document.getElementById("pushToken").value = storedToken;
  if(localStorage.getItem("eflow_installed") === "yes") hideInstallButtons();
  if(localStorage.getItem("eflow_notifications") === "on" || ("Notification" in window && Notification.permission === "granted")) hideNotificationButtons();
  if(sessionStorage.getItem("eflow_auth") === "ok") openApp();
  else setLoginMode(true);
});
