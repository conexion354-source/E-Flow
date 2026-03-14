const API = "https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec";
const PASSWORD = "1234nn";

let masterDatos = [];
let filteredDatos = [];
let deferredPrompt = null;
let chartBancos = null;

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
    return new Date(y, m-1, d);
  }
  const f = new Date(s);
  return isNaN(f) ? null : f;
}

function formatMoney(value) {
  return "$ " + Number(value || 0).toLocaleString("es-AR", {maximumFractionDigits: 2});
}

function setLoginMode(enabled){ document.body.classList.toggle("login-mode", enabled); }

function showStatus(message){
  const banner = document.getElementById("statusBanner");
  const apiText = document.getElementById("apiStatusText");
  if(!message){ banner.classList.add("hidden"); apiText.textContent = "Conectado correctamente."; return; }
  banner.textContent = message; banner.classList.remove("hidden"); apiText.textContent = message;
}

function login(){
  const clave = document.getElementById("clave").value;
  if(clave !== PASSWORD){ alert("Clave incorrecta"); return; }
  sessionStorage.setItem("eflow_auth", "ok");
  openApp();
}

function openApp(){
  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("app").setAttribute("aria-hidden", "false");
  setLoginMode(false);
  if(!masterDatos.length) cargar();
}

function logout(){
  sessionStorage.removeItem("eflow_auth");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("app").setAttribute("aria-hidden", "true");
  document.getElementById("login").classList.remove("hidden");
  setLoginMode(true);
  document.getElementById("clave").value = "";
  window.scrollTo(0,0);
}

async function cargar(){
  try{
    const r = await fetch(API + "?t=" + Date.now(), {cache:"no-store"});
    const text = await r.text();
    const data = JSON.parse(text);
    if(!Array.isArray(data)) throw new Error(data?.error || "La API no devolvió una lista.");
    masterDatos = data.filter(x => String(x.estado || "").toLowerCase() === "a pagar");
    filteredDatos = [...masterDatos];
    showStatus(masterDatos.length ? "" : "No se encontraron cheques con estado A Pagar.");
    renderAll();
  }catch(e){
    masterDatos = []; filteredDatos = [];
    renderAll();
    showStatus("No se pudieron cargar los datos. Revisá Google Apps Script.");
  }
}

function renderAll(){
  renderPanel();
  renderCheques();
  renderCalendario();
}

function renderPanel(){
  let total=0, hoyCant=0, prox7=0;
  const bancos = {};
  const buckets = {
    hoy:{m:0,c:0}, d1_7:{m:0,c:0}, d8_15:{m:0,c:0}, d16_30:{m:0,c:0}
  };
  const now = new Date(); now.setHours(0,0,0,0);

  filteredDatos.forEach(c=>{
    const monto = parseAmount(c.monto);
    total += monto;
    const banco = String(c.banco || "Sin banco");
    bancos[banco] = (bancos[banco] || 0) + monto;
    const fecha = parseDateSafe(c.fechaPago);
    if(!fecha) return;
    const diff = Math.ceil((fecha - now)/86400000);
    if(diff === 0){ hoyCant++; buckets.hoy.m += monto; buckets.hoy.c++; }
    else if(diff >= 1 && diff <= 7){ prox7++; buckets.d1_7.m += monto; buckets.d1_7.c++; }
    else if(diff >= 8 && diff <= 15){ buckets.d8_15.m += monto; buckets.d8_15.c++; }
    else if(diff >= 16 && diff <= 30){ buckets.d16_30.m += monto; buckets.d16_30.c++; }
  });

  document.getElementById("total").textContent = formatMoney(total);
  document.getElementById("cantidad").textContent = filteredDatos.length;
  document.getElementById("hoy").textContent = hoyCant;
  document.getElementById("proximos").textContent = prox7;
  document.getElementById("bucketHoyMonto").textContent = formatMoney(buckets.hoy.m);
  document.getElementById("bucketHoyCant").textContent = `${buckets.hoy.c} cheques`;
  document.getElementById("bucket7Monto").textContent = formatMoney(buckets.d1_7.m);
  document.getElementById("bucket7Cant").textContent = `${buckets.d1_7.c} cheques`;
  document.getElementById("bucket15Monto").textContent = formatMoney(buckets.d8_15.m);
  document.getElementById("bucket15Cant").textContent = `${buckets.d8_15.c} cheques`;
  document.getElementById("bucket30Monto").textContent = formatMoney(buckets.d16_30.m);
  document.getElementById("bucket30Cant").textContent = `${buckets.d16_30.c} cheques`;

  if (chartBancos) chartBancos.destroy();
  chartBancos = new Chart(document.getElementById("graficoBancos"), {
    type: "doughnut",
    data: {
      labels: Object.keys(bancos).length ? Object.keys(bancos) : ["Sin datos"],
      datasets: [{ data: Object.values(bancos).length ? Object.values(bancos) : [1] }]
    },
    options: { responsive:true, plugins:{ legend:{ position:"bottom" } } }
  });
}

function renderCalendario(){
  const list = document.getElementById("calendarList");
  list.innerHTML = "";
  const fechas = {};
  filteredDatos.forEach(c=>{
    const key = c.fechaPago || "Sin fecha";
    if(!fechas[key]) fechas[key] = {cant:0,monto:0,items:[]};
    fechas[key].cant += 1;
    fechas[key].monto += parseAmount(c.monto);
    fechas[key].items.push(c.proveedor);
  });

  const ordenadas = Object.entries(fechas)
    .filter(([k]) => k !== "Sin fecha")
    .sort((a,b)=>{
      const pa = a[0].split("/").map(Number);
      const pb = b[0].split("/").map(Number);
      return new Date(pa[2],pa[1]-1,pa[0]) - new Date(pb[2],pb[1]-1,pb[0]);
    });

  if(!ordenadas.length){
    list.innerHTML = '<div class="calendar-item"><div class="calendar-meta">No hay cheques a pagar para mostrar.</div></div>';
    return;
  }

  ordenadas.forEach(([fecha, info])=>{
    let level = "low";
    if(info.cant >= 4) level = "high";
    else if(info.cant >= 2) level = "medium";

    const item = document.createElement("div");
    item.className = "calendar-item " + level;
    item.innerHTML = `
      <div class="top">
        <div class="calendar-date">${fecha}</div>
        <div class="calendar-total">${formatMoney(info.monto)}</div>
      </div>
      <div class="calendar-meta">
        ${info.cant} cheques a pagar.<br>
        Proveedores: ${[...new Set(info.items)].join(", ")}
      </div>
    `;
    list.appendChild(item);
  });
}

function renderCheques(){
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  const now = new Date(); now.setHours(0,0,0,0);

  if(!filteredDatos.length){
    lista.innerHTML = '<article class="cheque"><div class="prov">No hay cheques a pagar</div><div class="meta">Cuando existan registros con estado A Pagar aparecerán acá.</div></article>';
    return;
  }

  [...filteredDatos].sort((a,b)=>{
    const da = parseDateSafe(a.fechaPago); const db = parseDateSafe(b.fechaPago);
    return (da || 0) - (db || 0);
  }).forEach(c=>{
    const fecha = parseDateSafe(c.fechaPago);
    let cls = "";
    let txt = "";
    if(fecha){
      const diff = Math.ceil((fecha - now)/86400000);
      if(diff === 0){ cls = "today"; txt = "Vence hoy"; }
      else if(diff >= 1 && diff <= 7){ cls = "near"; txt = `Vence en ${diff} días`; }
      else { cls = "future"; txt = `Vence en ${diff} días`; }
    }
    const div = document.createElement("article");
    div.className = "cheque " + cls;
    div.innerHTML = `
      <div class="row">
        <div class="prov">${c.proveedor || "-"}</div>
        <div class="amount">${formatMoney(parseAmount(c.monto))}</div>
      </div>
      <div class="meta">
        Banco: ${c.banco || "-"}<br>
        Pago: ${c.fechaPago || "-"}<br>
        Número: ${c.numeroCheque || "-"}<br>
        Estado: ${c.estado || "-"}${txt ? " · " + txt : ""}
      </div>
    `;
    lista.appendChild(div);
  });
}

function applySearch(text){
  const q = text.toLowerCase().trim();
  filteredDatos = masterDatos.filter(c =>
    String(c.proveedor || "").toLowerCase().includes(q) ||
    String(c.banco || "").toLowerCase().includes(q) ||
    String(c.numeroCheque || "").toLowerCase().includes(q)
  );
  renderAll();
}

document.addEventListener("input", e=>{
  if(e.target.id === "buscar") applySearch(e.target.value);
});

document.querySelectorAll(".menu-item").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".menu-item").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById(view).classList.add("active");
    window.scrollTo({top:0, behavior:"smooth"});
  });
});

window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("installBtnTop").classList.remove("hidden");
  document.getElementById("installBtnInside").classList.remove("hidden");
});

async function installApp(){
  if(!deferredPrompt){
    alert("Si no aparece el instalador automático, abrí el menú del navegador y elegí 'Instalar app' o 'Agregar a pantalla de inicio'.");
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById("installBtnTop").classList.add("hidden");
  document.getElementById("installBtnInside").classList.add("hidden");
}

document.getElementById("installBtnTop").addEventListener("click", installApp);
document.getElementById("installBtnInside").addEventListener("click", installApp);

window.addEventListener("load", ()=>{
  if(sessionStorage.getItem("eflow_auth") === "ok") openApp();
  else setLoginMode(true);
});
