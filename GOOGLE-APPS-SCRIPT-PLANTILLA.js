/*
PLANTILLA DE GOOGLE APPS SCRIPT - E-FLOW ULTRA PRO

Esta plantilla NO queda lista sola.
Necesita:
1) token del dispositivo
2) credenciales de service account de Firebase
3) acceso a la planilla de cheques

Qué hace:
- lee la API de cheques
- detecta cheques A Pagar
- arma grupos:
  hoy / 1 día / menos de 5 días / menos de 15 días
- deja listo el cuerpo para enviar por Firebase

Reemplazá:
DEVICE_TOKEN_AQUI
PROJECT_ID_AQUI
ACCESS_TOKEN_AQUI

Si querés usar esta plantilla de verdad, el próximo paso es cargar tu
service account y generar el access token OAuth2.
*/

const API_URL = "https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec";
const DEVICE_TOKEN = "DEVICE_TOKEN_AQUI";
const FIREBASE_PROJECT_ID = "PROJECT_ID_AQUI";
const ACCESS_TOKEN = "ACCESS_TOKEN_AQUI";

function parseFecha(valor) {
  if (!valor) return null;
  const p = String(valor).trim().split("/");
  if (p.length !== 3) return null;
  const d = Number(p[0]), m = Number(p[1]), y = Number(p[2]);
  return new Date(y, m - 1, d);
}

function diasRestantes(fecha) {
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const f = new Date(fecha);
  f.setHours(0,0,0,0);
  return Math.ceil((f - hoy) / 86400000);
}

function revisarCheques() {
  const res = UrlFetchApp.fetch(API_URL, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());

  const aPagar = data.filter(x => String(x.estado || "").trim().toLowerCase() === "a pagar");

  const hoy = [];
  const cinco = [];
  const quince = [];

  aPagar.forEach(c => {
    const fecha = parseFecha(c.fechaPago);
    if (!fecha) return;
    const diff = diasRestantes(fecha);

    if (diff <= 1) hoy.push(c);
    else if (diff < 5) cinco.push(c);
    else if (diff < 15) quince.push(c);
  });

  if (hoy.length) {
    enviarPush("E-Flow", `Tenés ${hoy.length} cheques para hoy o 1 día.`);
  } else if (cinco.length) {
    enviarPush("E-Flow", `Tenés ${cinco.length} cheques con menos de 5 días.`);
  } else if (quince.length) {
    enviarPush("E-Flow", `Tenés ${quince.length} cheques con menos de 15 días.`);
  }
}

function enviarPush(title, body) {
  const url = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;

  const payload = {
    message: {
      token: DEVICE_TOKEN,
      notification: {
        title: title,
        body: body
      }
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  Logger.log(res.getContentText());
}
