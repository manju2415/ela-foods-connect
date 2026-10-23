// Imported by the generated service worker (vite.config.ts: workbox.importScripts).
//
// Two jobs, both needed so a browser that is stuck on an old build recovers
// without the customer doing anything:
//
// 1. Deployment-pin recovery. The host pins a browser to the deployment it
//    first loaded via a `__dpl` cookie and serves that OLD deployment's
//    index.html for every request carrying the cookie — while sw.js itself
//    keeps coming from the CURRENT deployment. Workbox's install step
//    downloads index.html WITH cookies, so it can store the old shell under
//    the new revision key. The cookie may be HttpOnly (and iOS has no Cookie
//    Store API), so deleting it is only best-effort. The real fix is
//    repairShell() in `activate`: activation always runs after Workbox's
//    install-time precache has finished and before this worker answers any
//    page request (the browser holds fetches until activation completes), so
//    a stale shell cached during the FIRST install is repaired too.
//
// 2. Reload stale tabs. A tab still running OLD page JavaScript has no code
//    that reloads it, so once the worker has activated (and fixed the shell) it
//    navigates those tabs itself. Only clients controlled by the PREVIOUS
//    worker are returned by matchAll() at activation. Runs once per worker
//    version, so it cannot loop.
//
// Tabs on login / checkout / payment / wallet / registration / admin screens
// are left alone here — the worker can't see typing or an open payment sheet.
// The page itself (src/components/pwa/PWABadge.tsx) reloads those once it can
// see no input or OTP step would be lost.
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
// Best-effort only: no-op on Safari and for HttpOnly cookies.
async function clearDeploymentPin() {
  try {
    if (!self.cookieStore) return;
    const pins = await self.cookieStore.getAll(DEPLOYMENT_PIN_COOKIE);
    await Promise.all(
      pins.map((c) => self.cookieStore.delete({ name: c.name, domain: c.domain, path: c.path })),
    );
  } catch (e) {
    // Never let cookie cleanup break install/activation.
  }
}

/** Same-origin entry scripts/styles an index.html loads, as absolute paths. */
function shellAssetsOf(html) {
  const found = html.match(/\/?assets\/[A-Za-z0-9._-]+\.(?:js|css)/g) || [];
  return [...new Set(found.map((s) => (s[0] === "/" ? s : "/" + s)))].sort();
}

/** Fetch without cookies, so the host cannot route it to a pinned deployment. */
function fetchUnpinned(path) {
  return fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
}

/**
 * Downloads the current index.html without cookies and proves it is usable:
 * it must be real HTML, reference at least one entry script, and every
 * referenced asset must be served (cookieless) as a 200 with a matching
 * script/style content type — the host returns 404 text/plain for assets a
 * deployment does not contain, so this confirms HTML and assets come from the
 * same deployment. Returns { response, assets } or null.
 */
async function fetchValidatedShell() {
  const res = await fetchUnpinned("/index.html");
  if (!res.ok || res.status !== 200) return null;
  if (!/text\/html/i.test(res.headers.get("content-type") || "")) return null;
  const html = await res.clone().text();
  if (!/<div id="root"><\/div>/.test(html)) return null;
  const assets = shellAssetsOf(html);
  if (!assets.some((p) => p.endsWith(".js"))) return null;
  for (const path of assets) {
    const a = await fetchUnpinned(path);
    if (!a.ok || a.status !== 200) return null;
    const type = a.headers.get("content-type") || "";
    const ok = path.endsWith(".js") ? /javascript/i.test(type) : /text\/css/i.test(type);
    if (!ok) return null;
  }
  return { response: res, assets };
}

/**
 * Replace the precached index.html with a validated cookieless copy when the
 * cached one references different entry assets. Leaves the cache untouched on
 * any failure (offline, bad response, missing asset).
 */
async function repairShell() {
  try {
    const cacheName = (await caches.keys()).find((n) => n.startsWith("workbox-precache"));
    if (!cacheName) return "no-cache";
    const cache = await caches.open(cacheName);
    const shellKeys = (await cache.keys()).filter((r) => new URL(r.url).pathname === "/index.html");
    if (shellKeys.length === 0) return "no-shell";

    const fresh = await fetchValidatedShell();
    if (!fresh) return "fresh-invalid";
    const want = fresh.assets.join("|");

    let stale = false;
    for (const key of shellKeys) {
      const cached = await cache.match(key);
      if (!cached || shellAssetsOf(await cached.text()).join("|") !== want) stale = true;
    }
    if (!stale) return "up-to-date";

    for (const key of shellKeys) await cache.put(key, fresh.response.clone());
    return "replaced";
  } catch (e) {
    return "error"; // e.g. offline — the next worker update tries again.
  }
}

// Exposed for tests (tests/swShell.test.ts); harmless in the worker.
self.__elaShell = { shellAssetsOf, fetchValidatedShell, repairShell, NO_RELOAD_PATH_PREFIXES };

self.addEventListener("install", (event) => {
  event.waitUntil(clearDeploymentPin());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await clearDeploymentPin();
        await repairShell();
        const windows = await self.clients.matchAll({ type: "window" });
        windows.forEach((client) => {
          const path = new URL(client.url).pathname;
          if (NO_RELOAD_PATH_PREFIXES.some((p) => path.startsWith(p))) return;
          // Deliberately NOT awaited: navigate() settles only after this
          // worker finishes activating — awaiting would deadlock activation.
          client.navigate(client.url).catch(() => {});
        });
      } catch (e) {
        // Activation must never fail because of this.
      }
    })(),
  );
});
