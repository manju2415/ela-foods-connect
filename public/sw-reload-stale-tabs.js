// Imported by the generated service worker (vite.config.ts: workbox.importScripts).
//
// Why this exists: the browser fetches and installs a new sw.js on its own, but
// a tab that is still running OLD page JavaScript has no code that reloads it,
// so it keeps showing the old build until the user reloads by hand. The new
// worker is the only code guaranteed to run in that situation, so when it
// activates it navigates those stale tabs itself.
//
// Only clients that were controlled by the PREVIOUS worker are returned by
// matchAll() at activation time (a first-ever install has none, and this
// listener is registered before workbox's clientsClaim, so uncontrolled pages
// are not included). This runs once per new worker version, so it cannot loop.
//
// Tabs on login / checkout / payment / wallet / registration / admin screens
// are left alone — the worker can't see typing or an open payment sheet — and
// simply pick up the new version on their next navigation.
const NO_RELOAD_PATH_PREFIXES = [
  "/auth",
  "/mlm-login",
  "/signup",
  "/founder-signup",
  "/complete-registration",
  "/checkout",
  "/guest-checkout",
  "/registration-payment",
  "/payment-bridge",
  "/customer-app/wallet",
  "/member-app/wallet",
  "/admin",
  "/mlm-admin",
];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const windows = await self.clients.matchAll({ type: "window" });
        windows.forEach((client) => {
          const path = new URL(client.url).pathname;
          if (NO_RELOAD_PATH_PREFIXES.some((p) => path.startsWith(p))) return;
          // Deliberately NOT awaited: the navigation's own request is only
          // handled once this worker finishes activating, and navigate()
          // settles only when that request completes — awaiting it here
          // would deadlock activation and freeze the tab.
          client.navigate(client.url).catch(() => {});
        });
      } catch (e) {
        // Best-effort: activation must never fail because of this.
      }
    })(),
  );
});
