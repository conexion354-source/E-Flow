export async function cargarCheques() {
  const url = "PEGÁ_AQUI_TU_LINK_CSV";

  const res = await fetch(url);
  const text = await res.text();

  const filas = text.split("\n").map(f => f.split(","));

  const encabezados = filas.shift();

  return filas.map(fila => {
    const obj = {};
    encabezados.forEach((h, i) => {
      obj[h.trim()] = fila[i];
    });
    return obj;
  });
}
