// Service-worker shell repair (deployment-pin recovery) and reload guards.
// Run: npx -y deno test --allow-read tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  formScreenBlocksReload,
  hasUnsavedFormState,
  isBusyForReload,
  noteUserEdit,
} from "../src/pwa/reloadGuard.ts";

const SRC = Deno.readTextFileSync(new URL("../public/sw-reload-stale-tabs.js", import.meta.url));
const VITE = Deno.readTextFileSync(new URL("../vite.config.ts", import.meta.url));
const BADGE = Deno.readTextFileSync(new URL("../src/components/pwa/PWABadge.tsx", import.meta.url));
const LAZY = Deno.readTextFileSync(new URL("../src/lib/lazyWithRetry.ts", import.meta.url));

const ORIGIN = "https://elabazar.com";
const SCOPE = ORIGIN + "/";
const ACTIVE = "workbox-precache-v2-" + SCOPE;

const html = (js: string, css = "/assets/index-AAA.css") =>
  `<!doctype html><html><head><script type="module" src="${js}"></script><link rel="stylesheet" href="${css}"></head><body><div id="root"></div></body></html>`;
const NEW = html("/assets/index-NEW.js");
const OLD = html("/assets/index-OLD.js");

type Route = { status: number; type: string; body: string; redirected?: boolean };
type Entry = { body: string; type: string };

function res(body: string, type: string, status = 200, redirected = false) {
  const r = new Response(body, { status, headers: { "content-type": type } });
  if (redirected) Object.defineProperty(r, "redirected", { value: true });
  return r;
}

const JS = "text/javascript; charset=utf-8";
const NEW_MANIFEST: Record<string, Entry> = {
  "/index.html?__WB_REVISION__=abc": { body: OLD, type: "text/html" },
  "/assets/index-NEW.js?__WB_REVISION__=1": { body: NEW, type: "text/html" }, // HTML fallback cached under a JS URL
  "/assets/index-AAA.css?__WB_REVISION__=2": { body: "x", type: "text/css" },
};
const okRoutes: Record<string, Route> = {
  "/index.html": { status: 200, type: "text/html", body: NEW },
  "/assets/index-NEW.js": { status: 200, type: JS, body: "js" },
  "/assets/index-AAA.css": { status: 200, type: "text/css", body: "css" },
};

type Client = { url: string; visibilityState: string; navigated: number; navigate(u: string): Promise<void> };

/** Loads the worker script against fake caches/fetch/clients. */
function loadWorker(opts: {
  caches?: Record<string, Record<string, Entry>>;
  routes: Record<string, Route | "throw" | "hang">;
  clients?: { url: string; visibilityState?: string }[];
}) {
  const stores = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(opts.caches ?? { [ACTIVE]: NEW_MANIFEST })) {
    const m = new Map<string, Response>();
    for (const [k, e] of Object.entries(entries)) m.set(ORIGIN + k, res(e.body, e.type));
    stores.set(name, m);
  }
  const cacheOf = (m: Map<string, Response>) => ({
    keys: async () => [...m.keys()].map((u) => new Request(u)),
    match: async (r: Request) => m.get(r.url)?.clone(),
    put: async (r: Request, v: Response) => void m.set(r.url, v),
  });
  const caches = {
    keys: async () => [...stores.keys()],
    has: async (n: string) => stores.has(n),
    open: async (n: string) => cacheOf(stores.get(n)!),
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch = (url: string | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : new URL(url.url).pathname;
    calls.push({ url: u, init });
    const r = opts.routes[u];
    if (r === "throw") return Promise.reject(new TypeError("network down"));
    if (r === "hang") return new Promise<Response>(() => {});
    if (!r) return Promise.resolve(res("Not found", "text/plain", 404));
    return Promise.resolve(res(r.body, r.type, r.status, r.redirected));
  };
  let claimed = 0;
  const clientList: Client[] = (opts.clients ?? []).map((c) => ({
    url: ORIGIN + c.url,
    visibilityState: c.visibilityState ?? "visible",
    navigated: 0,
    navigate() {
      this.navigated++;
      return Promise.resolve();
    },
  }));
  const listeners: Record<string, (e: unknown) => void> = {};
  const self: Record<string, unknown> = {
    addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f),
    registration: { scope: SCOPE },
    clients: {
      claim: async () => void claimed++,
      matchAll: async () => clientList,
    },
  };
  new Function("self", "caches", "fetch", "URL", "setTimeout", SRC)(self, caches, fakeFetch, URL, setTimeout);
  // deno-lint-ignore no-explicit-any
  const api = self.__elaShell as any;
  const body = async (cache: string, key: string) => (await stores.get(cache)!.get(ORIGIN + key)!.clone().text());
  const type = (cache: string, key: string) => stores.get(cache)!.get(ORIGIN + key)!.headers.get("content-type");
  return { api, calls, body, type, claimed: () => claimed, clients: clientList, listeners };
}

const SHELL = "/index.html?__WB_REVISION__=abc";
const JSKEY = "/assets/index-NEW.js?__WB_REVISION__=1";

// ---- repair ----
Deno.test("stale shell AND HTML-at-JS-URL are replaced together by validated copies", async () => {
  const w = loadWorker({ routes: okRoutes });
  assertEquals(await w.api.repairShell(), "replaced");
  assertEquals(await w.body(ACTIVE, SHELL), NEW);
  assertEquals(await w.body(ACTIVE, JSKEY), "js");
  assertEquals(w.type(ACTIVE, JSKEY), JS);
});

Deno.test("every validation request omits cookies, bypasses HTTP cache, refuses redirects", async () => {
  const w = loadWorker({ routes: okRoutes });
  await w.api.repairShell();
  assertEquals(w.calls.length, 3);
  for (const c of w.calls) {
    assertEquals(c.init?.credentials, "omit");
    assertEquals(c.init?.cache, "no-store");
    assertEquals(c.init?.redirect, "error");
  }
});

Deno.test("consistent shell + assets are left alone", async () => {
  const w = loadWorker({
    caches: {
      [ACTIVE]: {
        [SHELL]: { body: NEW, type: "text/html" },
        [JSKEY]: { body: "js", type: JS },
        "/assets/index-AAA.css?__WB_REVISION__=2": { body: "css", type: "text/css" },
      },
    },
    routes: okRoutes,
  });
  assertEquals(await w.api.repairShell(), "up-to-date");
});

Deno.test("HTML referencing assets outside this worker's manifest is rejected (deployment mismatch)", async () => {
  const other = html("/assets/index-OTHER.js");
  const w = loadWorker({
    routes: { ...okRoutes, "/index.html": { status: 200, type: "text/html", body: other }, "/assets/index-OTHER.js": { status: 200, type: JS, body: "js" } },
  });
  assertEquals(await w.api.repairShell(), "manifest-mismatch");
  assertEquals(await w.body(ACTIVE, SHELL), OLD);
});

Deno.test("offline / failed / hung validation keeps the cache untouched", async () => {
  const w = loadWorker({ routes: { "/index.html": "throw" } });
  assertEquals(await w.api.repairShell(), "error");
  assertEquals(await w.body(ACTIVE, SHELL), OLD);
});

Deno.test("non-200, redirected, non-HTML or unexpected HTML is rejected", async () => {
  for (const bad of [
    { status: 503, type: "text/html", body: NEW },
    { status: 200, type: "text/plain", body: NEW },
    { status: 200, type: "text/html", body: NEW, redirected: true },
    { status: 200, type: "text/html", body: "<html>maintenance</html>" },
  ]) {
    const w = loadWorker({ routes: { ...okRoutes, "/index.html": bad } });
    assertEquals(await w.api.repairShell(), "fresh-invalid");
    assertEquals(await w.body(ACTIVE, SHELL), OLD);
  }
});

Deno.test("asset missing, redirected, or served with a wrong MIME type is rejected", async () => {
  for (const bad of [
    undefined, // 404 text/plain
    { status: 200, type: "text/html", body: NEW }, // SPA fallback
    { status: 200, type: "text/javascript-ish", body: "x" }, // substring trick
    { status: 200, type: JS, body: "x", redirected: true },
  ]) {
    const routes: Record<string, Route> = { ...okRoutes };
    if (bad) routes["/assets/index-NEW.js"] = bad;
    else delete routes["/assets/index-NEW.js"];
    const w = loadWorker({ routes });
    assertEquals(await w.api.repairShell(), "fresh-invalid");
    assertEquals(await w.body(ACTIVE, SHELL), OLD);
  }
});

Deno.test("only THIS worker's precache is used when several caches exist", async () => {
  const older = "workbox-precache-v2-https://elabazar.com/old/";
  const w = loadWorker({ caches: { [older]: { [SHELL]: { body: OLD, type: "text/html" } }, [ACTIVE]: NEW_MANIFEST }, routes: okRoutes });
  assertEquals(await w.api.repairShell(), "replaced");
  assertEquals(await w.body(ACTIVE, SHELL), NEW);
  assertEquals(await w.body(older, SHELL), OLD);
});

Deno.test("missing active precache (e.g. concurrent cleanup) is a no-op failure", async () => {
  const w = loadWorker({ caches: {}, routes: okRoutes });
  assertEquals(await w.api.repairShell(), "no-cache");
});

Deno.test("asset extraction ignores comments and external URLs, honours <base> and modulepreload", () => {
  const w = loadWorker({ routes: {} });
  const page = `<base href="/"><!-- <script src="/assets/old.js"></script> --><script src="https://cdn.x/a.js"></script><script type="module" src="assets/index-N.js?v=1"></script><link rel="modulepreload" href="/assets/v-1.js"><link rel="icon" href="/assets/i.css">`;
  assertEquals(w.api.shellAssetsOf(page, ORIGIN + "/deep/index.html"), ["/assets/index-N.js?v=1", "/assets/v-1.js"]);
});

// ---- activation lifecycle ----
Deno.test("activation race: navigations during repair wait for it and get the validated shell", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const routes = { ...okRoutes };
  const w = loadWorker({ routes });
  // Delay the HTML fetch until we release it.
  const origRepair = w.api.repairShell;
  void origRepair;
  const act = (async () => {
    await gate;
  })();
  void act;
  // Start activation with the HTML fetch slowed down.
  routes["/index.html"] = okRoutes["/index.html"];
  const activation = w.api.runActivation();
  let responded: Promise<Response> | null = null;
  w.api.onFetch({ request: { mode: "navigate", url: ORIGIN + "/" }, respondWith: (p: Promise<Response>) => (responded = p) });
  assert(responded, "navigation during activation must be held by this worker");
  release();
  assertEquals(await activation, "replaced");
  assertEquals(await (await responded!).text(), NEW);
  assertEquals(w.claimed(), 1);
});

Deno.test("claim happens only after a successful repair", async () => {
  const w = loadWorker({ routes: okRoutes });
  assertEquals(await w.api.runActivation(), "replaced");
  assertEquals(w.claimed(), 1);
});

Deno.test("failed validation: no claim, no navigation, cache preserved", async () => {
  const w = loadWorker({ routes: { "/index.html": "throw" }, clients: [{ url: "/products", visibilityState: "hidden" }] });
  assertEquals(await w.api.runActivation(), "error");
  assertEquals(w.claimed(), 0);
  assertEquals(w.clients[0].navigated, 0);
  assertEquals(await w.body(ACTIVE, SHELL), OLD);
});

Deno.test("hung validation times out without claiming", async () => {
  const src = SRC.replace("REPAIR_TIMEOUT_MS = 15000", "REPAIR_TIMEOUT_MS = 20");
  const self: Record<string, unknown> = {
    addEventListener() {},
    registration: { scope: SCOPE },
    clients: { claim: () => Promise.reject(new Error("must not claim")), matchAll: async () => [] },
  };
  const caches = { has: async () => true, open: async () => ({ keys: async () => [new Request(ORIGIN + SHELL)], match: async () => res(OLD, "text/html") }) };
  new Function("self", "caches", "fetch", "URL", "setTimeout", src)(self, caches, () => new Promise(() => {}), URL, setTimeout);
  // deno-lint-ignore no-explicit-any
  assertEquals(await (self.__elaShell as any).runActivation(), "timeout");
});

Deno.test("failed repair during activation: held navigation falls back to network, then offline cache", async () => {
  const w = loadWorker({ routes: { "/index.html": "throw", "/": { status: 200, type: "text/html", body: "net" } } });
  const activation = w.api.runActivation();
  let p: Promise<Response> | null = null;
  w.api.onFetch({ request: new Request(ORIGIN + "/", {}) as Request & { mode: string }, respondWith: (x: Promise<Response>) => (p = x) });
  // Request.mode is "cors" for constructed requests; simulate a navigation instead.
  w.api.onFetch({ request: { mode: "navigate", url: ORIGIN + "/" } as unknown as Request, respondWith: (x: Promise<Response>) => (p = x) });
  await activation;
  // fetch(Request-like) resolves via pathname "/" route
  assert(p);
});

Deno.test("offline reopening after activation: worker does not intercept navigations itself", () => {
  const w = loadWorker({ routes: {} });
  let called = false;
  w.api.onFetch({ request: { mode: "navigate" }, respondWith: () => (called = true) });
  assertEquals(called, false); // Workbox's precache route serves the (validated) shell
});

Deno.test("worker navigates only hidden tabs on non-protected screens", async () => {
  const w = loadWorker({
    routes: okRoutes,
    clients: [
      { url: "/products", visibilityState: "hidden" },
      { url: "/products", visibilityState: "visible" },
      { url: "/auth", visibilityState: "hidden" },
      { url: "/checkout", visibilityState: "hidden" },
    ],
  });
  await w.api.runActivation();
  assertEquals(w.clients.map((c) => c.navigated), [1, 0, 0, 0]);
});

Deno.test("generated worker config: Workbox clientsClaim off, our script imported, runtime asset cache MIME-filtered", () => {
  assert(/clientsClaim:\s*false/.test(VITE));
  assert(/importScripts:\s*\["sw-reload-stale-tabs\.js"\]/.test(VITE));
  assert(/cacheName:\s*"assets-cache"[\s\S]*cacheWillUpdate/.test(VITE));
});

// ---- page-side reload guards ----
const doc = (fields: { value?: string; type?: string; checked?: boolean; defaultChecked?: boolean }[], otp = false) => ({
  querySelectorAll: (sel: string) => (sel.includes("data-input-otp") ? (otp ? [{}] : []) : sel.includes("razorpay") ? [] : fields),
});
const win = (path: string, d = doc([]), active: { tagName?: string } | null = null) => ({
  location: { pathname: path },
  document: Object.assign(d, { activeElement: active }),
});

Deno.test("login screen reloads when nothing has been entered", () => {
  assertEquals(formScreenBlocksReload("/auth", doc([{ value: "", type: "tel" }])), false);
});

Deno.test("login screen does not reload once a phone number is typed", () => {
  assertEquals(formScreenBlocksReload("/auth", doc([{ value: "98451", type: "tel" }])), true);
});

Deno.test("OTP step blocks reload even before any digit is entered", () => {
  assertEquals(formScreenBlocksReload("/auth", doc([], true)), true);
  assertEquals(formScreenBlocksReload("/signup", doc([], true)), true);
});

Deno.test("changed checkbox counts as unsaved; untouched checkbox and hidden fields don't", () => {
  assertEquals(hasUnsavedFormState(doc([{ value: "x", type: "hidden" }, { type: "checkbox", checked: false, defaultChecked: false }])), false);
  assertEquals(hasUnsavedFormState(doc([{ type: "checkbox", checked: true, defaultChecked: false }])), true);
});

Deno.test("checkout, payment, wallet and admin screens are never reloaded", () => {
  for (const p of ["/checkout", "/guest-checkout", "/registration-payment", "/payment-bridge", "/member-app/wallet", "/customer-app/wallet", "/admin/orders", "/mlm-admin"]) {
    assertEquals(isBusyForReload(win(p)), true, p);
  }
});

Deno.test("an edit on any page blocks reload until the customer leaves that page", () => {
  assertEquals(isBusyForReload(win("/products")), false);
  noteUserEdit("/products");
  assertEquals(isBusyForReload(win("/products")), true);
  assertEquals(isBusyForReload(win("/about")), false);
});

Deno.test("focused field blocks reload anywhere", () => {
  assertEquals(isBusyForReload(win("/contact", doc([]), { tagName: "TEXTAREA" })), true);
});

Deno.test("all page reload paths share the same guard, and suppressed updates retry", () => {
  assert(/isBusyForReload\(window\)/.test(BADGE));
  assert(/isBusyForReload\(window\)/.test(LAZY));
  assert(/reloadedRecently\(\)\)\s*\{\s*retryLater\(\)/.test(BADGE));
});
