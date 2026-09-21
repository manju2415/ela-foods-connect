import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAuthRecovery } from "./lib/authRecovery";

installAuthRecovery();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Harmless marker so a deploy produces a new bundle hash (used to verify the
// PWA auto-update flow end to end). Safe to delete after testing.
(window as Window & { __ELA_BUILD_MARK?: string }).__ELA_BUILD_MARK = "sw-update-test-4";
console.info("[app] running build:", "sw-update-test-4");
