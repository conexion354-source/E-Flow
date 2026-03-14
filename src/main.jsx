import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div style={{
      fontFamily: "sans-serif",
      padding: "40px",
      textAlign: "center"
    }}>
      <h1>E-Flow</h1>
      <p>Panel de cheques funcionando 🚀</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
