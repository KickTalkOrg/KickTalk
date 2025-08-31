import "./assets/styles/main.scss";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Load telemetry only after the preload script has finished initializing
const loadTelemetry = () => import("./telemetry/webTracing");
if (window.__KT_PRELOAD_READY__) {
  loadTelemetry();
} else {
  window.addEventListener("preload-ready", loadTelemetry, { once: true });
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
