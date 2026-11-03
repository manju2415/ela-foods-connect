// Tests for order notifications: helpers in _shared/orderMessaging.ts and the
// send-order-notifications worker (all provider calls are faked; nothing is sent).
// Run: npx -y deno test --allow-env --allow-read --import-map=supabase/functions/_tests/import_map.json supabase/functions/_tests/
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { db } from "./fake_supabase.ts";
import { handlers } from "./fake_serve.ts";
import {
  buildVariables,
  classifyHttp,
  type ClaimedRow,
  fitVar,
  formatAmount,
  jwtRole,
  msg91SmsBody,
  msg91WhatsAppBody,
  normalizeIndianMobile,
  parseSettings,
  pickCustomerPhone,
} from "../_shared/orderMessaging.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");

const jwt = (role: string) => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ role, iss: "supabase" })}.sig`;
};

const row = (over: Partial<ClaimedRow> = {}): ClaimedRow => ({
  id: "n1", order_id: "o1", event: "order_confirmed", channel: "sms", seq: 1, attempts: 1,
  order_number: "ELA-1001", order_value: 250, order_status: "pending", payment_status: "completed",
  fulfillment_type: "delivery", address_phone: "+91 98765 43210", profile_phone: "9000000001",
  partner_type: null, partner_name: null, rider_name: null, rider_phone: null, ...over,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
Deno.test("normalizeIndianMobile accepts +91/91/0 prefixes and spacing, rejects the rest", () => {
  assertEquals(normalizeIndianMobile("+91 98765-43210"), "9876543210");
  assertEquals(normalizeIndianMobile("919876543210"), "9876543210");
  assertEquals(normalizeIndianMobile("09876543210"), "9876543210");
  assertEquals(normalizeIndianMobile("9876543210"), "9876543210");
  assertEquals(normalizeIndianMobile("5876543210"), null);
  assertEquals(normalizeIndianMobile("98765"), null);
  assertEquals(normalizeIndianMobile(null), null);
});

Deno.test("pickCustomerPhone: address first, profile fallback, pickup uses profile only", () => {
  assertEquals(pickCustomerPhone(row()), "9876543210");
  assertEquals(pickCustomerPhone(row({ address_phone: "bad" })), "9000000001");
  assertEquals(pickCustomerPhone(row({ fulfillment_type: "store_pickup", address_phone: "9111111111" })), "9000000001");
  assertEquals(pickCustomerPhone(row({ address_phone: null, profile_phone: null })), null);
});

Deno.test("fitVar trims control characters, whitespace and length", () => {
  assertEquals(fitVar("  Ravi\n\tKumar "), "Ravi Kumar");
  const long = fitVar("x".repeat(40));
  assertEquals(long.length, 30);
  assert(long.endsWith("…"));
});

Deno.test("formatAmount", () => {
  assertEquals(formatAmount(250), "250");
  assertEquals(formatAmount("249.5"), "249.50");
  assertEquals(formatAmount(null), "0");
});

Deno.test("buildVariables for confirmation and dispatch", () => {
  assertEquals(buildVariables(row()), ["ELA-1001", "250"]);
  const d = row({ event: "order_dispatched", partner_type: "rapido", rider_name: "Ravi", rider_phone: "9123456789" });
  assertEquals(buildVariables(d), ["ELA-1001", "Rapido", "Ravi", "9123456789"]);
  assertEquals(buildVariables({ ...d, partner_type: "other", partner_name: "Dunzo", rider_name: null }),
    ["ELA-1001", "Dunzo", "our delivery partner", "9123456789"]);
  assertEquals(buildVariables({ ...d, partner_type: "in_house" })?.[1], "Ela Bazar delivery");
  assertEquals(buildVariables({ ...d, partner_type: null }), null);
});

Deno.test("parseSettings: missing or malformed is off with channels disabled", () => {
  for (const raw of [undefined, null, "garbage", {}, { mode: "LIVE" }, { mode: "on" }]) {
    const s = parseSettings(raw);
    assertEquals(s.mode, "off");
    assertEquals(s.sms.enabled, false);
    assertEquals(s.whatsapp.enabled, false);
  }
  const s = parseSettings({ mode: "live", sms: { enabled: true, confirmation_flow_id: " f1 " }, whatsapp: { enabled: "true" } });
  assertEquals(s.mode, "live");
  assertEquals(s.sms.confirmationFlowId, "f1");
  assertEquals(s.whatsapp.enabled, false, "only boolean true enables");
});

Deno.test("classifyHttp: success, definite rejection, retryable, ambiguous", () => {
  assertEquals(classifyHttp(200, '{"type":"success","message":"3561726c"}'), { outcome: "sent", requestId: "3561726c" });
  assertEquals(classifyHttp(200, '{"type":"error","message":"Template ID missing or invalid (211)"}').outcome, "failed");
  assertEquals(classifyHttp(503, "upstream").outcome, "retry");
  assertEquals(classifyHttp(429, "{}").outcome, "retry");
  assertEquals(classifyHttp(401, '{"message":"bad key"}').outcome, "failed");
  assertEquals(classifyHttp(400, '{"message":"invalid mobile"}').outcome, "failed");
  assertEquals(classifyHttp(200, "<html>").outcome, "unknown");
  assertEquals(classifyHttp(200, '{"status":"success","hasError":false,"request_id":"wa-1"}'), { outcome: "sent", requestId: "wa-1" });
});

Deno.test("MSG91 request bodies", () => {
  assertEquals(msg91SmsBody("flow1", "9876543210", ["A", "B"]), {
    template_id: "flow1", short_url: "0", recipients: [{ mobiles: "919876543210", VAR1: "A", VAR2: "B" }],
  });
  const wa = msg91WhatsAppBody("9000000009", "order_confirmed", "en", "9876543210", ["A"]);
  assertEquals(wa.integrated_number, "919000000009");
  assertEquals(wa.payload.template.to_and_components[0], { to: ["919876543210"], components: { body_1: { type: "text", value: "A" } } });
});

Deno.test("jwtRole", () => {
  assertEquals(jwtRole(`Bearer ${jwt("service_role")}`), "service_role");
  assertEquals(jwtRole(`Bearer ${jwt("anon")}`), "anon");
  assertEquals(jwtRole("Bearer nonsense"), null);
  assertEquals(jwtRole(null), null);
});

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
const before = handlers.length;
await import("../send-order-notifications/index.ts");
const worker = handlers[before];

let fetchCalls: Array<{ url: string; body: any }> = [];
let fetchImpl: () => Promise<Response> = async () => new Response('{"type":"success","message":"req-1"}');
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  fetchCalls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
  return await fetchImpl();
}) as typeof fetch;

let claimedRows: ClaimedRow[] = [];
let completed: any[] = [];
const setup = (settings: unknown, rows: ClaimedRow[], env: { live?: boolean; key?: boolean } = {}) => {
  db.reset();
  fetchCalls = [];
  completed = [];
  claimedRows = rows;
  fetchImpl = async () => new Response('{"type":"success","message":"req-1"}');
  if (settings !== undefined) db.tables.platform_settings.push({ key: "order_notifications", value: settings });
  db.rpcs.claim_order_notifications = () => {
    const out = claimedRows; claimedRows = []; return { data: out, error: null };
  };
  db.rpcs.complete_order_notification = (args) => { completed.push(args); return { data: args.p_outcome, error: null }; };
  if (env.live) Deno.env.set("ORDER_NOTIFICATIONS_LIVE", "true"); else Deno.env.delete("ORDER_NOTIFICATIONS_LIVE");
  if (env.key) Deno.env.set("MSG91_AUTH_TOKEN", "k-123"); else Deno.env.delete("MSG91_AUTH_TOKEN");
};
const call = (role = "service_role") =>
  worker(new Request("http://x/", { method: "POST", headers: { Authorization: `Bearer ${jwt(role)}` } }));

const LIVE = { mode: "live", sms: { enabled: true, confirmation_flow_id: "flow-c", dispatch_flow_id: "flow-d" } };

Deno.test("worker rejects non-service callers without touching anything", async () => {
  setup(LIVE, [row()], { live: true, key: true });
  for (const role of ["anon", "authenticated"]) {
    const res = await call(role);
    assertEquals(res.status, 403);
  }
  assertEquals(db.calls.filter((c) => c.startsWith("rpc:")), []);
  assertEquals(fetchCalls.length, 0);
});

Deno.test("worker: setting missing or off -> claims nothing, sends nothing", async () => {
  for (const s of [undefined, { mode: "off", sms: { enabled: true, confirmation_flow_id: "f" } }]) {
    setup(s, [row()], { live: true, key: true });
    const res = await call();
    assertEquals((await res.json()).mode, "off");
    assert(!db.calls.includes("rpc:claim_order_notifications"));
    assertEquals(fetchCalls.length, 0);
  }
});

Deno.test("worker: record_only marks rows skipped without calling a provider", async () => {
  setup({ ...LIVE, mode: "record_only" }, [row(), row({ id: "n2", channel: "whatsapp" })], { live: true, key: true });
  await call();
  assertEquals(fetchCalls.length, 0);
  assertEquals(completed.map((c) => [c.p_id, c.p_outcome, c.p_phone_last4]), [["n1", "skipped", "3210"], ["n2", "skipped", "3210"]]);
});

Deno.test("worker: live setting without the server activation secret sends nothing", async () => {
  setup(LIVE, [row()], { live: false, key: true });
  await call();
  assertEquals(fetchCalls.length, 0);
  assertEquals(completed[0].p_outcome, "skipped");
  assert(String(completed[0].p_error).includes("not activated"));
});

Deno.test("worker: live, missing auth key or flow id -> skipped, nothing sent", async () => {
  setup(LIVE, [row()], { live: true, key: false });
  await call();
  assertEquals([fetchCalls.length, completed[0].p_outcome], [0, "skipped"]);

  setup({ mode: "live", sms: { enabled: true } }, [row()], { live: true, key: true });
  await call();
  assertEquals([fetchCalls.length, completed[0].p_outcome], [0, "skipped"]);

  setup(LIVE, [row({ channel: "whatsapp" })], { live: true, key: true });
  await call();
  assertEquals([fetchCalls.length, completed[0].p_outcome], [0, "skipped"], "WhatsApp not configured");
});

Deno.test("worker: live SMS confirmation sends once with the right flow and records the request id", async () => {
  setup(LIVE, [row()], { live: true, key: true });
  await call();
  assertEquals(fetchCalls.length, 1);
  assertEquals(fetchCalls[0].url, "https://control.msg91.com/api/v5/flow/");
  assertEquals(fetchCalls[0].body, {
    template_id: "flow-c", short_url: "0", recipients: [{ mobiles: "919876543210", VAR1: "ELA-1001", VAR2: "250" }],
  });
  assertEquals(completed[0], { p_id: "n1", p_outcome: "sent", p_provider_request_id: "req-1", p_error: null, p_phone_last4: "3210" });
});

Deno.test("worker: live dispatch SMS uses the dispatch flow and rider details", async () => {
  setup(LIVE, [row({ event: "order_dispatched", order_status: "shipped", partner_type: "porter", rider_name: "Ravi", rider_phone: "9123456789" })], { live: true, key: true });
  await call();
  assertEquals(fetchCalls[0].body.template_id, "flow-d");
  assertEquals(fetchCalls[0].body.recipients[0], { mobiles: "919876543210", VAR1: "ELA-1001", VAR2: "Porter", VAR3: "Ravi", VAR4: "9123456789" });
});

Deno.test("worker: provider 503 -> retry; timeout -> unknown (never auto-resent); network error -> retry", async () => {
  setup(LIVE, [row()], { live: true, key: true });
  fetchImpl = async () => new Response("busy", { status: 503 });
  await call();
  assertEquals(completed[0].p_outcome, "retry");

  setup(LIVE, [row()], { live: true, key: true });
  fetchImpl = async () => { throw new DOMException("aborted", "AbortError"); };
  await call();
  assertEquals(completed[0].p_outcome, "unknown");

  setup(LIVE, [row()], { live: true, key: true });
  fetchImpl = async () => { throw new TypeError("connection refused"); };
  await call();
  assertEquals(completed[0].p_outcome, "retry");
});

Deno.test("worker: cancelled or unpaid order -> skipped; no phone -> failed; no dispatch record -> failed", async () => {
  setup(LIVE, [
    row({ id: "a", order_status: "cancelled" }),
    row({ id: "b", payment_status: "refunded" }),
    row({ id: "c", address_phone: null, profile_phone: null }),
    row({ id: "d", event: "order_dispatched" }),
  ], { live: true, key: true });
  await call();
  assertEquals(fetchCalls.length, 0);
  assertEquals(completed.map((c) => [c.p_id, c.p_outcome]), [["a", "skipped"], ["b", "skipped"], ["c", "failed"], ["d", "failed"]]);
});

Deno.test("worker: claim error returns 500 and sends nothing", async () => {
  setup(LIVE, [], { live: true, key: true });
  db.rpcs.claim_order_notifications = () => ({ data: null, error: { message: "boom" } });
  const res = await call();
  assertStrictEquals(res.status, 500);
  assertEquals(fetchCalls.length, 0);
});
