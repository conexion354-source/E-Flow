
const API = "https://script.google.com/macros/s/AKfycbxfn6Iyr4zG3MfZRtn21TzOnK7YK0juz7fodC-0kWm9nq-nT1-nqR4B68xDx-F2aDbFJA/exec";
const PASSWORD = "1234nn";

let masterDatos = [];
let filteredDatos = [];
let deferredPrompt = null;
let currentFilter = "a_pagar_all";
let currentMonth = new Date();

function stripAccents(s){
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeStatus(v){
  return stripAccents(String(v || "").trim().toLowerCase()).replace(/\s+/g, " ");
}
function isPendiente(estado){
  const s = normalizeStatus(estado);
  if (!s) return false;
  if (s.includes("rechaz")) return false;
  if (s.includes("anulad")) return false;
  if (s.includes("pagad")) return false;
  return s.includes("pagar");
}
function isRechazado(estado){
  return normalizeStatus(estado).includes("rechaz");
}
function isAnulado(estado){
  return normalizeStatus(estado).includes("anulad");
}
function parseAmount(value) {
  const cleaned = String(value ?? "").replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
function parseDateSafe(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const p = s.split("/");
  if (p.length === 3) {
    const [d,m,y] = p.map(Number);
    if (!d || !m || !y) return null;
    const dt = new Date(y,m-1,d);
    if (isNaN(dt)) return null;
    dt.setHours(0,0,0,0);
    return dt;
  }
  const f = new Date(s);
  if (isNaN(f)) return null;
  f.setHours(0,0,0,0);
  return f;
}
function formatMoney(value) {
  return "$ " + Number(value || 0).toLocaleString("es-AR", {maximumFractionDigits: 2});
}
function setLoginMode(enabled){ document.body.classList.toggle("login-mode", enabled); }
function setApiStatus(text){ const el = document.getElementById("apiStatusText"); if(el) el.textContent = text; }
function showStatus(message){
  const banner = document.getElementById("statusBanner");
  if(!banner) return;
  if(!message){ banner.classList.add("hidden"); setApiStatus("Conectado correctamente."); return; }
  banner.textContent = message;
  banner.classList.remove("hidden");
  setApiStatus(message);
}

function openApp(){
  document.getElementById("login")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  setLoginMode(false);
  if(!masterDatos.length) cargar();
}

window.login = function(){
  const clave = document.getElementById("clave")?.value || "";
  if(clave !== PASSWORD){ alert("Clave incorrecta"); return; }
  sessionStorage.setItem("eflow_auth","ok");
  openApp();
};

window.logout = function(){
  sessionStorage.removeItem("eflow_auth");
  document.getElementById("app")?.classList.add("hidden");
  document.getElementById("login")?.classList.remove("hidden");
  setLoginMode(true);
  const c = document.getElementById("clave");
  if(c) c.value = "";
};

async function cargar(){
  try{
    setApiStatus("Consultando planilla...");
    const r = await fetch(API + "?t=" + Date.now(), {cache:"no-store"});
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("La API no devolvió JSON válido."); }
    if(!Array.isArray(data)) throw new Error(data?.error || "La API no devolvió una lista.");

    masterDatos = data.map(x => ({
      fechaSalida: x.fechaSalida || "",
      proveedor: x.proveedor || "",
      fechaPago: x.fechaPago || "",
      banco: x.banco || "",
      numeroCheque: x.numeroCheque || "",
      tipo: x.tipo || "",
      monto: x.monto || "",
      estado: x.estado || "",
      observacion: x.observacion || ""
    }));

    const aPagar = masterDatos.filter(x => isPendiente(x.estado));
    const first = aPagar.find(x => parseDateSafe(x.fechaPago));
    currentMonth = first ? new Date(parseDateSafe(first.fechaPago).getFullYear(), parseDateSafe(first.fechaPago).getMonth(), 1) : new Date();

    applyFilter(currentFilter, false);
    showStatus(aPagar.length ? "" : "La API responde, pero no hay registros con estado A Pagar.");
  }catch(e){
    masterDatos = [];
    filteredDatos = [];
    renderAll();
    showStatus("No se pudieron cargar los datos. " + (e?.message || e));
  }
}

function diffDays(fecha){
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((fecha - now)/86400000);
}

function filterByType(data, filter){
  if(filter === "a_pagar_all") return data.filter(x => isPendiente(x.estado));
  if(filter === "rechazados") return data.filter(x => isRechazado(x.estado));
  if(filter === "anulados") return data.filter(x => isAnulado(x.estado));
  return data.filter(x => {
    if(!isPendiente(x.estado)) return false;
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
    total += parseAmount(c.monto);
    const fecha = parseDateSafe(c.fechaPago);
    if(!fecha) return;
    const diff = diffDays(fecha);
    if(diff <= 1) red++;
    else if(diff < 5) orange++;
    else if(diff < 15) yellow++;
    else if(diff >= 30) green++;
  });

  [["total", formatMoney(total)], ["cantidad", aPagar.length], ["greenCount", green], ["yellowCount", yellow], ["orangeCount", orange], ["redCount", red]]
    .forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.textContent = val; });

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
  if(!grid || !detail) return;
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
  for(let i=1;i<weekday;i++){ const empty=document.createElement("div"); empty.className="cal-day empty"; grid.appendChild(empty); }

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
      <div class="detail-actions">
        <button class="share-btn" type="button">Compartir imagen</button>
      </div>
    `;
    div.querySelector(".share-btn").addEventListener("click", ()=> shareChequeCard(div));
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
    const capture = card.cloneNode(true);
    capture.querySelector(".detail-actions")?.remove();
    capture.classList.add("cheque-capture");
    capture.style.width = "720px";
    capture.style.position = "fixed";
    capture.style.left = "-99999px";
    capture.style.top = "0";
    document.body.appendChild(capture);
    const canvas = await html2canvas(capture, {backgroundColor:"#ffffff", scale:2});
    document.body.removeChild(capture);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const file = new File([blob], "detalle-cheque.png", {type:"image/png"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:"Detalle de cheque", text:"Detalle de cheque - E-Flow"});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "detalle-cheque.png"; a.click();
      URL.revokeObjectURL(url);
      alert("Se descargó la imagen del cheque.");
    }
  }catch(e){
    alert("No se pudo compartir el detalle.");
  }
}

function switchToView(view){
  document.querySelectorAll(".menu-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(view)?.classList.add("active");
  document.querySelector(`.menu-item[data-view="${view}"]`)?.classList.add("active");
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

function bindUI(){
  document.getElementById("loginBtn")?.addEventListener("click", window.login);
  document.getElementById("clave")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") window.login(); });
  document.querySelectorAll(".menu-item").forEach(btn=> btn.addEventListener("click", ()=> switchToView(btn.dataset.view)));
  document.querySelectorAll(".tappable").forEach(btn=> btn.addEventListener("click", ()=> applyFilter(btn.dataset.filter, true)));
  document.querySelectorAll("[data-toggle-group]").forEach(btn=> btn.addEventListener("click", ()=> toggleStatusGroup(btn.dataset.toggleGroup)));
  document.getElementById("prevMonth")?.addEventListener("click", ()=>{ currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1); renderCalendarioMensual(); });
  document.getElementById("nextMonth")?.addEventListener("click", ()=>{ currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1); renderCalendarioMensual(); });
  document.getElementById("logoutBtn")?.addEventListener("click", window.logout);
  document.getElementById("buscar")?.addEventListener("input", e => applySearch(e.target.value));
  document.getElementById("installBtnLogin")?.addEventListener("click", installApp);
}

window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  deferredPrompt = e;
  if(localStorage.getItem("eflow_installed") === "yes") return;
  document.getElementById("installBtnLogin")?.classList.remove("hidden");
});

async function installApp(){
  if(!deferredPrompt){
    alert("Abrí el menú del navegador y elegí Instalar app o Agregar a pantalla de inicio.");
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  localStorage.setItem("eflow_installed", "yes");
  document.getElementById("installBtnLogin")?.classList.add("hidden");
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

window.addEventListener("load", ()=>{
  bindUI();
  if(localStorage.getItem("eflow_installed") === "yes") document.getElementById("installBtnLogin")?.classList.add("hidden");
  if(sessionStorage.getItem("eflow_auth") === "ok") openApp();
  else setLoginMode(true);
});
