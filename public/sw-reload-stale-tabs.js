// Imported by the generated service worker (vite.config.ts: workbox.importScripts).
// importScripts runs before Workbox registers its own listeners, so the
// listeners below run first.
//
// Problem: the host pins a browser to an old deployment via a `__dpl` cookie
// (possibly HttpOnly; iOS has no Cookie Store API), while sw.js itself comes
// from the CURRENT deployment. Workbox's install step downloads index.html
// and the entry assets WITH cookies, so the precache can end up holding the
// old shell, or an HTML fallback under a new script URL.
//
// What this file guarantees, without relying on browser fetch-buffering:
// 1. On activate, repairShell() fetches index.html and every entry asset it
//    references WITHOUT cookies, validates them (status, no redirect, exact
//    MIME type, every asset is in THIS worker's precache manifest), and
//    writes HTML + assets together into THIS worker's precache. Any failure
//    leaves the cache exactly as it was.
// 2. Until the repair settles, navigations handled by this worker wait for it
//    (they never get the unvalidated cached shell).
// 3. clients.claim() (Workbox clientsClaim is off) runs only after a
//    successful repair — so pages get controllerchange, and the page's own
//    reload guard (src/pwa/reloadGuard.ts) decides if/when to reload.
// 4. The worker itself only navigates HIDDEN tabs on non-protected screens,
//    and only after a successful repair. It cannot see typing, so it never
//    navigates a visible tab.

const PROTECTED_PATH_PREFIXES = [
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
const REPAIR_TIMEOUT_MS = 15000;
const OK_RESULTS = ["up-to-date", "replaced"];

// Best-effort only: no-op on Safari and for HttpOnly cookies.
async function clearDeploymentPin() {
  try {
    if (!self.cookieStore) return;
    const pins = await self.cookieStore.getAll(DEPLOYMENT_PIN_COOKIE);
    await Promise.all(pins.map((c) => self.cookieStore.delete({ name: c.name, domain: c.domain, path: c.path })));
  } catch (e) {
    /* never break install/activation */
  }
}

/** Exact script/style MIME check (no substring matching). */
function mimeOk(path, contentType) {
  const type = (contentType || "").toLowerCase().split(";")[0].trim();
  if (path.endsWith(".js")) return type === "text/javascript" || type === "application/javascript";
  if (path.endsWith(".css")) return type === "text/css";
  return false;
}

/**
 * Same-origin entry scripts/stylesheets an index.html loads, resolved like the
 * browser would (honours <base href>, ignores comments), as path+query.
 */
function shellAssetsOf(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const baseMatch = clean.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
  const base = baseMatch ? new URL(baseMatch[1], baseUrl).href : baseUrl;
  const out = new Set();
  const add = (raw) => {
    let u;
    try {
      u = new URL(raw, base);
    } catch (e) {
      return;
    }
    if (u.origin !== origin) return;
    if (!/\.(?:js|css)$/.test(u.pathname)) return;
    out.add(u.pathname + u.search);
  };
  for (const m of clean.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) add(m[1]);
  for (const m of clean.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (!/\b(?:stylesheet|modulepreload)\b/i.test(rel)) continue;
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (href) add(href);
  }
  return [...out].sort();
}

/** Fetch without cookies, so the host cannot route it to a pinned deployment. */
function fetchUnpinned(path) {
  return fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
}

function usable(res) {
  return !!res && res.ok && res.status === 200 && !res.redirected;
}

/**
 * Downloads index.html and every entry asset it references without cookies.
 * Returns { html, response, assets: [{ path, response }] } or null.
 */
async function fetchValidatedShell(scope) {
  const res = await fetchUnpinned("/index.html");
  if (!usable(res)) return null;
  if ((res.headers.get("content-type") || "").toLowerCase().split(";")[0].trim() !== "text/html") return null;
  const html = await res.clone().text();
  if (!/<div id="root"><\/div>/.test(html)) return null;
  const paths = shellAssetsOf(html, new URL("/index.html", scope).href);
  if (!paths.some((p) => p.split("?")[0].endsWith(".js"))) return null;
  const assets = [];
  for (const path of paths) {
    const a = await fetchUnpinned(path);
    if (!usable(a) || !mimeOk(path.split("?")[0], a.headers.get("content-type"))) return null;
    assets.push({ path, response: a });
  }
  return { html, response: res, assets };
}

/** Precache key path with Workbox's revision parameter removed. */
function keyPath(url) {
  const u = new URL(url);
  u.searchParams.delete("__WB_REVISION__");
  return u.pathname + u.search;
}

/** THIS worker's precache (Workbox naming: workbox-precache-v2-<scope>). */
function precacheName() {
  return "workbox-precache-v2-" + self.registration.scope;
}

/**
 * Makes THIS worker's precache hold a validated, matching shell + assets.
 * Returns "up-to-date" | "replaced" on success; anything else is a failure
 * that left the cache untouched.
 */
async function repairShell() {
  try {
    const name = precacheName();
    if (!(await caches.has(name))) return "no-cache";
    const cache = await caches.open(name);
    const keys = await cache.keys();
    const shellKeys = keys.filter((r) => new URL(r.url).pathname === "/index.html");
    if (shellKeys.length === 0) return "no-shell";

    const fresh = await fetchValidatedShell(self.registration.scope);
    if (!fresh) return "fresh-invalid";

    // Every asset the fresh HTML needs must belong to THIS worker's manifest,
    // otherwise sw.js and the HTML come from different deployments.
    const assetKeys = [];
    for (const a of fresh.assets) {
      const k = keys.find((r) => keyPath(r.url) === a.path);
      if (!k) return "manifest-mismatch";
      assetKeys.push({ key: k, response: a.response });
    }

    const want = fresh.assets.map((a) => a.path).join("|");
    let stale = false;
    for (const key of shellKeys) {
      const cached = await cache.match(key);
      if (!cached || shellAssetsOf(await cached.text(), key.url).join("|") !== want) stale = true;
    }
    for (const { key } of assetKeys) {
      const cached = await cache.match(key);
      if (!cached || !mimeOk(new URL(key.url).pathname, cached.headers.get("content-type"))) stale = true;
    }
    if (!stale) return "up-to-date";

    // All responses are already validated in memory: write assets, then HTML.
    for (const { key, response } of assetKeys) await cache.put(key, response.clone());
    for (const key of shellKeys) await cache.put(key, fresh.response.clone());
    return "replaced";
  } catch (e) {
    return "error"; // e.g. offline — cache untouched; the next update retries.
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r("timeout"), ms))]);
}

// Pending repair for this worker's activation; navigations wait on it.
let repairing = null;

async function cachedShell() {
  const cache = await caches.open(precacheName());
  const key = (await cache.keys()).find((r) => new URL(r.url).pathname === "/index.html");
  return key ? cache.match(key) : undefined;
}

function onFetch(event) {
  if (!repairing || event.request.mode !== "navigate") return;
  event.respondWith(
    repairing.then(async (result) => {
      if (OK_RESULTS.includes(result)) {
        const shell = await cachedShell();
        if (shell) return shell;
      }
      // Repair failed: behave as if there were no worker (plain network),
      // falling back to the existing cache only when offline.
      try {
        return await fetch(event.request);
      } catch (e) {
        const shell = await cachedShell();
        if (shell) return shell;
        throw e;
      }
    }),
  );
}

async function runActivation() {
  // Set synchronously, before any await, so no navigation slips past it.
  repairing = withTimeout(
    clearDeploymentPin().then(() => repairShell()),
    REPAIR_TIMEOUT_MS,
  );
  let result;
  try {
    result = await repairing;
  } finally {
    repairing = null;
  }
  if (!OK_RESULTS.includes(result)) return result; // keep known-good state, no claim, no navigation
  await self.clients.claim();
  const windows = await self.clients.matchAll({ type: "window" });
  for (const client of windows) {
    const path = new URL(client.url).pathname;
    if (PROTECTED_PATH_PREFIXES.some((p) => path.startsWith(p))) continue;
    if (client.visibilityState !== "hidden") continue; // page guard decides for visible tabs
    // Not awaited: navigate() may settle only after activation completes.
    client.navigate(client.url).catch(() => {});
  }
  return result;
}

// Exposed for tests (tests/swShell.test.ts); harmless in the worker.
self.__elaShell = {
  shellAssetsOf,
  mimeOk,
  fetchValidatedShell,
  repairShell,
  runActivation,
  onFetch,
  PROTECTED_PATH_PREFIXES,
};

self.addEventListener("install", (event) => {
  event.waitUntil(clearDeploymentPin());
});

self.addEventListener("fetch", onFetch);

self.addEventListener("activate", (event) => {
  event.waitUntil(runActivation().catch(() => {}));
});
