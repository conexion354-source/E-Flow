const API = "https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec";
const PASSWORD = "1234nn";

let masterDatos = [];
let filteredDatos = [];
let deferredPrompt = null;
let chartBancos = null;
let chartProveedores = null;

function parseAmount(value) {
  const n = parseFloat(String(value ?? "").replace(/\./g, "").replace(",", "."));
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
  return "$ " + Number(value || 0).toLocaleString("es-AR");
}

function setLoginMode(enabled) {
  document.body.classList.toggle("login-mode", enabled);
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

function cargar() {
  fetch(API)
    .then(r => r.json())
    .then(data => {
      masterDatos = Array.isArray(data) ? data : [];
      filteredDatos = [...masterDatos];
      renderAll();
    })
    .catch(() => {
      alert("No se pudieron cargar los datos.");
    });
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
  const bancos = {};
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
    }
  });

  document.getElementById("cantidad").textContent = filteredDatos.length;
  document.getElementById("total").textContent = formatMoney(total);
  document.getElementById("vencidos").textContent = vencidos;
  document.getElementById("proximos").textContent = proximos;

  const labels = Object.keys(bancos);
  const values = Object.values(bancos);
  if (chartBancos) chartBancos.destroy();
  chartBancos = new Chart(document.getElementById("graficoBancos"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

function renderCheques() {
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  filteredDatos.forEach(c => {
    const fecha = parseDateSafe(c.fechaPago);
    let extraClass = "";
    if (fecha) {
      const diff = Math.ceil((fecha - hoy) / 86400000);
      if (diff < 0) extraClass = "vencido";
      else if (diff <= 7) extraClass = "proximo";
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
        Estado: ${c.estado || "-"}
      </div>
    `;
    lista.appendChild(div);
  });
}

function renderReportes() {
  let total = 0;
  const bancos = {};
  const proveedores = {};

  filteredDatos.forEach(c => {
    const monto = parseAmount(c.monto);
    total += monto;
    const banco = String(c.banco || "Sin banco");
    const proveedor = String(c.proveedor || "Sin proveedor");
    bancos[banco] = (bancos[banco] || 0) + monto;
    proveedores[proveedor] = (proveedores[proveedor] || 0) + monto;
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
      labels: topProv.map(x => x[0]),
      datasets: [{ data: topProv.map(x => x[1]) }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
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
  document.getElementById("installBtn").classList.remove("hidden");
  document.getElementById("installBtnInside").classList.remove("hidden");
});

async function installApp() {
  if (!deferredPrompt) {
    alert("La instalación depende del navegador. Si no aparece, abrí el menú del navegador y elegí 'Instalar app' o 'Agregar a pantalla de inicio'.");
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById("installBtn").classList.add("hidden");
  document.getElementById("installBtnInside").classList.add("hidden");
}

document.getElementById("installBtn").addEventListener("click", installApp);
document.getElementById("installBtnInside").addEventListener("click", installApp);

window.addEventListener("load", () => {
  if (sessionStorage.getItem("eflow_auth") === "ok") {
    openApp();
  } else {
    setLoginMode(true);
  }
});
