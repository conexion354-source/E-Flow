const API = "https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec";
const PASSWORD = "1234nn";

let masterDatos = [];
let filteredDatos = [];
let deferredPrompt = null;
let chartBancos = null;
let chartProveedores = null;

function parseAmount(value) {
  const cleaned = String(value ?? "")
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDateSafe(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    return new Date(y, m - 1, d);
  }
  const fallback = new Date(s);
  return isNaN(fallback) ? null : fallback;
}

function formatMoney(value) {
  return "$ " + Number(value || 0).toLocaleString("es-AR", {maximumFractionDigits: 2});
}

function setLoginMode(enabled) {
  document.body.classList.toggle("login-mode", enabled);
}

function showStatus(message) {
  const banner = document.getElementById("statusBanner");
  const apiText = document.getElementById("apiStatusText");
  if (!message) {
    banner.classList.add("hidden");
    apiText.textContent = "Conectado correctamente.";
    return;
  }
  banner.textContent = message;
  banner.classList.remove("hidden");
  apiText.textContent = message;
}

function login() {
  const clave = document.getElementById("clave").value;
  if (clave !== PASSWORD) {
    alert("Clave incorrecta");
    return;
  }
  sessionStorage.setItem("eflow_auth", "ok");
  openApp();
}

function openApp() {
  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("app").setAttribute("aria-hidden", "false");
  setLoginMode(false);
  if (!masterDatos.length) cargar();
}

function logout() {
  sessionStorage.removeItem("eflow_auth");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("app").setAttribute("aria-hidden", "true");
  document.getElementById("login").classList.remove("hidden");
  setLoginMode(true);
  document.getElementById("clave").value = "";
  window.scrollTo(0,0);
}

async function cargar() {
  try {
    const r = await fetch(API + "?t=" + Date.now(), {cache: "no-store"});
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("La API no devolvió JSON válido.");
    }

    if (!Array.isArray(data)) {
      throw new Error(data?.error || "La API no devolvió una lista de cheques.");
    }

    masterDatos = data.filter(item => String(item.estado || "").toLowerCase() !== "pagado");
    filteredDatos = [...masterDatos];
    if (!masterDatos.length) {
      showStatus("No se encontraron cheques pendientes para mostrar.");
    } else {
      showStatus("");
    }
    renderAll();
  } catch (e) {
    masterDatos = [];
    filteredDatos = [];
    renderAll();
    showStatus("No se pudieron cargar los datos. Revisá Google Apps Script.");
  }
}

function bucketLabel(diff) {
  if (diff === 0) return "hoy";
  if (diff >= 1 && diff <= 7) return "d1_7";
  if (diff >= 8 && diff <= 15) return "d8_15";
  if (diff >= 16 && diff <= 30) return "d16_30";
  if (diff >= 31 && diff <= 60) return "d31_60";
  if (diff > 60) return "d60plus";
  return "vencido";
}

function renderAll() {
  renderPanel();
  renderCheques();
  renderReportes();
}

function renderPanel() {
  let total = 0;
  let vencidos = 0;
  let proximos = 0;
  let hoyCount = 0;
  const bancos = {};
  const buckets = {
    hoy:{monto:0,cant:0},
    d1_7:{monto:0,cant:0},
    d8_15:{monto:0,cant:0},
    d16_30:{monto:0,cant:0},
    d31_60:{monto:0,cant:0},
    d60plus:{monto:0,cant:0}
  };
  const agendaMap = {};
  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  filteredDatos.forEach(c => {
    const monto = parseAmount(c.monto);
    total += monto;

    const banco = String(c.banco || "Sin banco");
    bancos[banco] = (bancos[banco] || 0) + monto;

    const fecha = parseDateSafe(c.fechaPago);
    if (fecha) {
      const diff = Math.ceil((fecha - hoy) / 86400000);
      if (diff < 0) vencidos++;
      else if (diff <= 7) proximos++;
      if (diff === 0) hoyCount++;

      const key = bucketLabel(diff);
      if (buckets[key]) {
        buckets[key].monto += monto;
        buckets[key].cant += 1;
      }

      const dateKey = fecha.toLocaleDateString("es-AR");
      if (!agendaMap[dateKey]) agendaMap[dateKey] = {cant:0,monto:0};
      agendaMap[dateKey].cant += 1;
      agendaMap[dateKey].monto += monto;
    }
  });

  document.getElementById("cantidad").textContent = filteredDatos.length;
  document.getElementById("total").textContent = formatMoney(total);
  document.getElementById("vencidos").textContent = vencidos;
  document.getElementById("proximos").textContent = proximos;
  document.getElementById("hoy").textContent = hoyCount;

  document.getElementById("bucketHoyMonto").textContent = formatMoney(buckets.hoy.monto);
  document.getElementById("bucketHoyCant").textContent = `${buckets.hoy.cant} cheques`;
  document.getElementById("bucket7Monto").textContent = formatMoney(buckets.d1_7.monto);
  document.getElementById("bucket7Cant").textContent = `${buckets.d1_7.cant} cheques`;
  document.getElementById("bucket15Monto").textContent = formatMoney(buckets.d8_15.monto);
  document.getElementById("bucket15Cant").textContent = `${buckets.d8_15.cant} cheques`;
  document.getElementById("bucket30Monto").textContent = formatMoney(buckets.d16_30.monto);
  document.getElementById("bucket30Cant").textContent = `${buckets.d16_30.cant} cheques`;
  document.getElementById("bucket60Monto").textContent = formatMoney(buckets.d31_60.monto);
  document.getElementById("bucket60Cant").textContent = `${buckets.d31_60.cant} cheques`;
  document.getElementById("bucketMas60Monto").textContent = formatMoney(buckets.d60plus.monto);
  document.getElementById("bucketMas60Cant").textContent = `${buckets.d60plus.cant} cheques`;

  const agendaSorted = Object.entries(agendaMap)
    .sort((a,b) => {
      const pa = a[0].split("/").map(Number);
      const pb = b[0].split("/").map(Number);
      return new Date(pa[2], pa[1]-1, pa[0]) - new Date(pb[2], pb[1]-1, pb[0]);
    })
    .slice(0, 8);

  const agendaEl = document.getElementById("agendaResumen");
  agendaEl.innerHTML = "";
  if (!agendaSorted.length) {
    agendaEl.innerHTML = '<div class="agenda-item"><div class="agenda-meta">No hay fechas de pago pendientes.</div></div>';
  } else {
    agendaSorted.forEach(([fecha, info]) => {
      const item = document.createElement("div");
      item.className = "agenda-item";
      item.innerHTML = `
        <div class="top">
          <div class="agenda-date">${fecha}</div>
          <div class="agenda-total">${formatMoney(info.monto)}</div>
        </div>
        <div class="agenda-meta">${info.cant} cheques programados para esta fecha.</div>
      `;
      agendaEl.appendChild(item);
    });
  }

  const labels = Object.keys(bancos);
  const values = Object.values(bancos);
  if (chartBancos) chartBancos.destroy();
  chartBancos = new Chart(document.getElementById("graficoBancos"), {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["Sin datos"],
      datasets: [{ data: values.length ? values : [1] }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function renderCheques() {
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  if (!filteredDatos.length) {
    const empty = document.createElement("article");
    empty.className = "cheque";
    empty.innerHTML = `<div class="prov">No hay datos para mostrar</div><div class="meta">Cuando la API responda correctamente, los cheques aparecerán acá.</div>`;
    lista.appendChild(empty);
    return;
  }

  const sorted = [...filteredDatos].sort((a,b) => {
    const da = parseDateSafe(a.fechaPago);
    const db = parseDateSafe(b.fechaPago);
    return (da || 0) - (db || 0);
  });

  sorted.forEach(c => {
    const fecha = parseDateSafe(c.fechaPago);
    let extraClass = "";
    let estadoFecha = "";
    if (fecha) {
      const diff = Math.ceil((fecha - hoy) / 86400000);
      if (diff < 0) { extraClass = "vencido"; estadoFecha = "Vencido"; }
      else if (diff === 0) { extraClass = "proximo"; estadoFecha = "Vence hoy"; }
      else if (diff <= 7) { extraClass = "proximo"; estadoFecha = `Vence en ${diff} días`; }
      else { estadoFecha = `Vence en ${diff} días`; }
    }

    const div = document.createElement("article");
    div.className = "cheque " + extraClass;
    div.innerHTML = `
      <div class="row">
        <div class="prov">${c.proveedor || "-"}</div>
        <div class="amount">${formatMoney(parseAmount(c.monto))}</div>
      </div>
      <div class="meta">
        Banco: ${c.banco || "-"}<br>
        Pago: ${c.fechaPago || "-"}<br>
        Número: ${c.numeroCheque || "-"}<br>
        Estado: ${c.estado || "-"}${estadoFecha ? " · " + estadoFecha : ""}
      </div>
    `;
    lista.appendChild(div);
  });
}

function renderReportes() {
  let total = 0;
  const bancos = {};
  const proveedores = {};
  const fechas = {};

  filteredDatos.forEach(c => {
    const monto = parseAmount(c.monto);
    total += monto;
    const banco = String(c.banco || "Sin banco");
    const proveedor = String(c.proveedor || "Sin proveedor");
    const fecha = String(c.fechaPago || "Sin fecha");
    bancos[banco] = (bancos[banco] || 0) + monto;
    proveedores[proveedor] = (proveedores[proveedor] || 0) + monto;
    if (!fechas[fecha]) fechas[fecha] = {cant:0,monto:0};
    fechas[fecha].cant += 1;
    fechas[fecha].monto += monto;
  });

  const promedio = filteredDatos.length ? total / filteredDatos.length : 0;
  const bancoPrincipal = Object.entries(bancos).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-";
  const proveedorPrincipal = Object.entries(proveedores).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-";

  document.getElementById("promedio").textContent = formatMoney(promedio);
  document.getElementById("bancoPrincipal").textContent = bancoPrincipal;
  document.getElementById("proveedorPrincipal").textContent = proveedorPrincipal;

  const topProv = Object.entries(proveedores).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (chartProveedores) chartProveedores.destroy();
  chartProveedores = new Chart(document.getElementById("graficoProveedores"), {
    type: "bar",
    data: {
      labels: topProv.length ? topProv.map(x => x[0]) : ["Sin datos"],
      datasets: [{ data: topProv.length ? topProv.map(x => x[1]) : [0] }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const calendarList = document.getElementById("calendarList");
  calendarList.innerHTML = "";
  const fechasOrdenadas = Object.entries(fechas)
    .filter(([fecha]) => fecha && fecha !== "Sin fecha")
    .sort((a,b) => {
      const pa = a[0].split("/").map(Number);
      const pb = b[0].split("/").map(Number);
      return new Date(pa[2], pa[1]-1, pa[0]) - new Date(pb[2], pb[1]-1, pb[0]);
    });

  if (!fechasOrdenadas.length) {
    calendarList.innerHTML = '<div class="calendar-item"><div class="calendar-meta">No hay fechas para mostrar.</div></div>';
  } else {
    fechasOrdenadas.forEach(([fecha, info]) => {
      const item = document.createElement("div");
      item.className = "calendar-item";
      item.innerHTML = `
        <div class="top">
          <div class="calendar-date">${fecha}</div>
          <div class="calendar-total">${formatMoney(info.monto)}</div>
        </div>
        <div class="calendar-meta">${info.cant} cheques en esta fecha.</div>
      `;
      calendarList.appendChild(item);
    });
  }
}

function applySearch(text) {
  const q = text.toLowerCase().trim();
  filteredDatos = masterDatos.filter(c => {
    return String(c.proveedor || "").toLowerCase().includes(q) ||
           String(c.banco || "").toLowerCase().includes(q) ||
           String(c.numeroCheque || "").toLowerCase().includes(q);
  });
  renderAll();
}

document.addEventListener("input", (e) => {
  if (e.target.id === "buscar") {
    applySearch(e.target.value);
  }
});

document.querySelectorAll(".menu-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".menu-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(view).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("installBtnTop").classList.remove("hidden");
  document.getElementById("installBtnInside").classList.remove("hidden");
});

async function installApp() {
  if (!deferredPrompt) {
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

window.addEventListener("load", () => {
  if (sessionStorage.getItem("eflow_auth") === "ok") {
    openApp();
  } else {
    setLoginMode(true);
  }
});\n