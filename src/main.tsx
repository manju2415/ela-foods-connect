import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAuthRecovery } from "./lib/authRecovery";
import { BUILD_MARK } from "./buildMark";
import { Capacitor } from "@capacitor/core";
import { installEditTracker } from "./pwa/reloadGuard";

installAuthRecovery();
// Lets automatic reloads (app updates, chunk recovery) see unsaved edits.
installEditTracker();

// Installed app only: enables the app-only styles in index.css (tap feedback,
// no text selection, no overscroll bounce, screen fade, bottom-sheet dialogs).
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Harmless marker so a deploy produces a new bundle hash (used to verify the
// PWA auto-update flow end to end). Safe to delete after testing.
(window as Window & { __ELA_BUILD_MARK?: string }).__ELA_BUILD_MARK = BUILD_MARK;
console.info("[app] running build:", BUILD_MARK);
