import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { cargarCheques } from "./apiSheets";

function App() {
  const [cheques, setCheques] = useState([]);

  useEffect(() => {
    cargarCheques().then(setCheques);
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>E-Flow</h1>
      <p>Panel de cheques conectado a Google Sheets</p>

      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Fecha Pago</th>
            <th>Banco</th>
            <th>Número</th>
            <th>Monto</th>
            <th>Estado</th>
          </tr>
        </thead>

        <tbody>
          {cheques.map((c, i) => (
            <tr key={i}>
              <td>{c["Proveedor"]}</td>
              <td>{c["Fecha de Pago"]}</td>
              <td>{c["Banco de Emisión"]}</td>
              <td>{c["Número de Cheque"]}</td>
              <td>{c["Monto"]}</td>
              <td>{c["Estado"]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
