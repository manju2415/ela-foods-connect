// Service-worker shell repair (deployment-pin recovery) and login reload guard.
// Run: npx -y deno test --allow-read tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { formScreenBlocksReload, hasUnsavedFormState } from "../src/pwa/reloadGuard.ts";

const SRC = Deno.readTextFileSync(new URL("../public/sw-reload-stale-tabs.js", import.meta.url));

const html = (js: string, css = "/assets/index-AAA.css") =>
  `<!doctype html><html><head><script type="module" src="${js}"></script><link rel="stylesheet" href="${css}"></head><body><div id="root"></div></body></html>`;
const NEW = html("/assets/index-NEW.js");
const OLD = html("/assets/index-OLD.js");

type Route = { status: number; type: string; body: string };
type Call = { url: string; init?: RequestInit };

/** Loads the worker script against fake caches/fetch and returns its helpers. */
function loadWorker(opts: { cachedShell?: string; routes: Record<string, Route | "throw"> }) {
  const store = new Map<string, Response>();
  const shellKey = "https://elabazar.com/index.html?__WB_REVISION__=abc";
  if (opts.cachedShell !== undefined) store.set(shellKey, new Response(opts.cachedShell));
  const cache = {
    keys: async () => [...store.keys()].map((u) => new Request(u)),
    match: async (r: Request) => store.get(r.url)?.clone(),
    put: async (r: Request, res: Response) => void store.set(r.url, res),
  };
  const calls: Call[] = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = opts.routes[url];
    if (r === "throw") throw new TypeError("network down");
    if (!r) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(r.body, { status: r.status, headers: { "content-type": r.type } });
  };
  const self: Record<string, unknown> = { addEventListener() {} };
  const caches = { keys: async () => ["workbox-precache-v2-https://elabazar.com/"], open: async () => cache };
  new Function("self", "caches", "fetch", "URL", SRC)(self, caches, fakeFetch, URL);
  // deno-lint-ignore no-explicit-any
  const api = self.__elaShell as any;
  return { api, calls, cachedShell: async () => store.get(shellKey)!.clone().text() };
}

const okAssets = {
  "/assets/index-NEW.js": { status: 200, type: "text/javascript; charset=utf-8", body: "x" },
  "/assets/index-AAA.css": { status: 200, type: "text/css", body: "x" },
};

Deno.test("stale cached shell is replaced by the validated current HTML", async () => {
  const w = loadWorker({ cachedShell: OLD, routes: { "/index.html": { status: 200, type: "text/html", body: NEW }, ...okAssets } });
  assertEquals(await w.api.repairShell(), "replaced");
  assertEquals(await w.cachedShell(), NEW);
});

Deno.test("every validation request is sent without cookies and bypasses HTTP cache", async () => {
  const w = loadWorker({ cachedShell: OLD, routes: { "/index.html": { status: 200, type: "text/html", body: NEW }, ...okAssets } });
  await w.api.repairShell();
  assertEquals(w.calls.length, 3);
  for (const c of w.calls) {
    assertEquals(c.init?.credentials, "omit");
    assertEquals(c.init?.cache, "no-store");
  }
});

Deno.test("up-to-date shell is left alone", async () => {
  const w = loadWorker({ cachedShell: NEW, routes: { "/index.html": { status: 200, type: "text/html", body: NEW }, ...okAssets } });
  assertEquals(await w.api.repairShell(), "up-to-date");
});

Deno.test("failed HTML fetch (offline) keeps the cached shell", async () => {
  const w = loadWorker({ cachedShell: OLD, routes: { "/index.html": "throw" } });
  assertEquals(await w.api.repairShell(), "error");
  assertEquals(await w.cachedShell(), OLD);
});

Deno.test("non-200 or non-HTML response keeps the cached shell", async () => {
  for (const bad of [
    { status: 503, type: "text/html", body: NEW },
    { status: 200, type: "text/plain", body: NEW },
    { status: 200, type: "text/html", body: "<html>maintenance</html>" },
  ]) {
    const w = loadWorker({ cachedShell: OLD, routes: { "/index.html": bad, ...okAssets } });
    assertEquals(await w.api.repairShell(), "fresh-invalid");
    assertEquals(await w.cachedShell(), OLD);
  }
});

Deno.test("HTML whose script is missing from the deployment is rejected", async () => {
  // Host returns 404 text/plain for an asset that deployment doesn't contain.
  const w = loadWorker({ cachedShell: OLD, routes: { "/index.html": { status: 200, type: "text/html", body: NEW }, "/assets/index-AAA.css": okAssets["/assets/index-AAA.css"] } });
  assertEquals(await w.api.repairShell(), "fresh-invalid");
  assertEquals(await w.cachedShell(), OLD);
});

Deno.test("an asset answered with HTML (SPA fallback) is rejected", async () => {
  const w = loadWorker({
    cachedShell: OLD,
    routes: { "/index.html": { status: 200, type: "text/html", body: NEW }, ...okAssets, "/assets/index-NEW.js": { status: 200, type: "text/html", body: NEW } },
  });
  assertEquals(await w.api.repairShell(), "fresh-invalid");
  assertEquals(await w.cachedShell(), OLD);
});

Deno.test("asset list is extracted from both script and stylesheet tags", async () => {
  const w = loadWorker({ routes: {} });
  assertEquals(w.api.shellAssetsOf(NEW), ["/assets/index-AAA.css", "/assets/index-NEW.js"]);
});

Deno.test("repair runs during activation, after Workbox's install-time precache", () => {
  assert(/addEventListener\("activate"[\s\S]*await repairShell\(\)[\s\S]*matchAll/.test(SRC));
});

// ---- login / signup reload guard ----
const doc = (fields: { value?: string; type?: string }[], otp = false) => ({
  querySelectorAll: (sel: string) => (sel.includes("data-input-otp") ? (otp ? [{}] : []) : fields),
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

Deno.test("hidden fields and checkboxes don't count as unsaved input", () => {
  assertEquals(hasUnsavedFormState(doc([{ value: "x", type: "hidden" }, { value: "on", type: "checkbox" }])), false);
});

Deno.test("non-form pages are not affected by the form guard", () => {
  assertEquals(formScreenBlocksReload("/products", doc([{ value: "rice" }])), false);
});
