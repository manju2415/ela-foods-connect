// Imported by the generated service worker (vite.config.ts: workbox.importScripts).
//
// Two jobs, both needed so a browser that is stuck on an old build recovers
// without the customer doing anything:
//
// 1. Deployment-pin recovery. The host pins a browser to the deployment it
//    first loaded via a `__dpl` cookie, and then serves that OLD deployment's
//    index.html for every request carrying the cookie — while sw.js itself
//    keeps coming from the CURRENT deployment. So when a new worker installs,
//    workbox downloads index.html under the stale pin and stores the old shell
//    (which loads the old JS bundle) under the NEW revision key, and the worker
//    then serves that stale shell forever. Here the worker (which can read and
//    delete cookies through the Cookie Store API) removes the stale pin, then
//    replaces the cached shell with a fresh copy.
//
// 2. Reload stale tabs. A tab still running OLD page JavaScript has no code
//    that reloads it, so once the worker has activated (and fixed the shell) it
//    navigates those tabs itself. Only clients that were controlled by the
//    PREVIOUS worker are returned by matchAll() at activation (a first-ever
//    install has none, and this listener is registered before workbox's
//    clientsClaim, so uncontrolled pages are not included). This runs once per
//    new worker version, so it cannot loop.
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

const DEPLOYMENT_PIN_COOKIE = "__dpl";

// Removes only the host's deployment-pin cookie (never anything else).
async function clearDeploymentPin() {
  try {
    if (!self.cookieStore) return;
    const pins = await self.cookieStore.getAll(DEPLOYMENT_PIN_COOKIE);
    await Promise.all(
      pins.map((c) => self.cookieStore.delete({ name: c.name, domain: c.domain, path: c.path })),
    );
  } catch (e) {
    // Best-effort: never let cookie cleanup break install/activation.
  }
}

// If the cached app shell references a script that this worker did not
// precache, it is a stale shell (see above). Replace it with a fresh copy, but
// only when that copy is consistent with what this worker precached.
async function refreshStaleShell() {
  try {
    const cacheName = (await caches.keys()).find((n) => n.startsWith("workbox-precache"));
    if (!cacheName) return;
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const precachedPaths = new Set(keys.map((r) => new URL(r.url).pathname));
    const shellKeys = keys.filter((r) => new URL(r.url).pathname === "/index.html");
    if (shellKeys.length === 0) return;

    const scriptsOf = (html) => (html.match(/\/?assets\/[A-Za-z0-9._-]+\.js/g) || []).map((s) => (s[0] === "/" ? s : "/" + s));
    const isConsistent = (html) => scriptsOf(html).every((p) => precachedPaths.has(p));

    let needsRefresh = false;
    for (const key of shellKeys) {
      const cached = await cache.match(key);
      if (!cached || !isConsistent(await cached.text())) needsRefresh = true;
    }
    if (!needsRefresh) return;

    const fresh = await fetch("/index.html", { cache: "reload", credentials: "same-origin" });
    if (!fresh.ok) return;
    if (!isConsistent(await fresh.clone().text())) return; // fresh copy doesn't match this worker's precache — keep as is
    await Promise.all(shellKeys.map((key) => cache.put(key, fresh.clone())));
  } catch (e) {
    // Best-effort (e.g. offline): the next worker update tries again.
  }
}

// Try to drop the stale pin before workbox downloads the shell; the activate
// step below repairs the shell if that download already raced ahead of it.
self.addEventListener("install", (event) => {
  event.waitUntil(clearDeploymentPin());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await clearDeploymentPin();
        await refreshStaleShell();
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
