import React from "react";
import { createRoot } from "react-dom/client";

import "./estilos/tokens.css";
import "./estilos/app.css";

import PlanejamentoOrcamentario from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PlanejamentoOrcamentario />
  </React.StrictMode>
);
