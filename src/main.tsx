import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Debug: helps confirm which React build/version is actually running in the browser.
// If hooks crash with "dispatcher null", it often points to a duplicated React instance.
console.log("[boot] React.version:", React.version);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);