// Tests for the logged-in (member_order) Razorpay path used by the Android
// payment bridge: razorpay-create-order auth + server-side quoting,
// settlePayment ownership, and the client-side bridge/error helpers.
// Run: npx -y deno test --allow-env --allow-read --import-map=supabase/functions/_tests/import_map.json supabase/functions/_tests/
import { assert, assertEquals, assertFalse, assertRejects } from "jsr:@std/assert@1";
import { createClient, db, seedUser } from "./fake_supabase.ts";
import { handlers } from "./fake_serve.ts";
import { settlePayment } from "../_shared/settlePayment.ts";
import {
  PaymentError,
  buildBridgePayload,
  decodeBridgePayload,
  encodeBridgePayload,
  isPreparedOrder,
  paymentErrorFromInvoke,
} from "../../../src/utils/paymentBridge.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("RAZORPAY_KEY_SECRET", "rzp-secret");

// Razorpay stand-in.
let razorpayFail: { description: string } | null = null;
const razorpayOrders: Array<{ amount: number }> = [];
globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
  if (razorpayFail) return new Response(JSON.stringify({ error: razorpayFail }), { status: 400 });
  const body = JSON.parse(String(init?.body ?? "{}"));
  razorpayOrders.push(body);
  return new Response(JSON.stringify({ id: `order_T${razorpayOrders.length}`, amount: body.amount, currency: body.currency }));
}) as typeof fetch;

await import("../razorpay-create-order/index.ts");
const handler = handlers.at(-1)!;

// quote_checkout stand-in: prices come from this table, never from the request.
const PRICES: Record<string, number> = { "prod-rice": 545 };
const quoteCalls: Array<Record<string, unknown>> = [];
const stubQuote = () => {
  db.rpcs.quote_checkout = (args) => {
    quoteCalls.push(args);
    const items = args.p_items as Array<{ product_id: string; quantity: number }>;
    if (items.some((i) => !(i.product_id in PRICES))) return { data: { success: false, error: "Some items are no longer available." }, error: null };
    return { data: { success: true, total_amount: items.reduce((t, i) => t + PRICES[i.product_id] * i.quantity, 0) }, error: null };
  };
};

const ALICE = "alice@elabazar.local";
const BOB = "bob@elabazar.local";
const cart = (items = [{ product_id: "prod-rice", quantity: 2 }]) => ({ items, shipping_address: { city: "Kochi" }, fulfillment_type: "delivery" });

const setup = () => {
  db.reset();
  quoteCalls.length = 0;
  razorpayOrders.length = 0;
  razorpayFail = null;
  stubQuote();
};

const createOrder = async (body: Record<string, unknown>, authorization?: string) => {
  const headers: Record<string, string> = {};
  if (authorization) headers.Authorization = authorization;
  const res = await handler(new Request("http://fake.local/razorpay-create-order", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

const memberBody = (extra: Record<string, unknown> = {}) => ({
  amount: 1, // client-supplied amount: must be ignored
  purpose: "member_order",
  attemptContext: { purpose: "member_order", checkout: cart() },
  ...extra,
});

// ---- razorpay-create-order --------------------------------------------------

Deno.test("signed-in customer (app session) gets a Razorpay order for the server-quoted amount", async () => {
  setup();
  const alice = seedUser(ALICE);
  const r = await createOrder(memberBody(), `Bearer at-${alice.id}`);
  assertEquals(r.status, 200);
  assertEquals(r.body.order_id, "order_T1");
  assertEquals(r.body.amount, 109000); // 2 x 545 = ₹1,090, in paise
  assert(isPreparedOrder(r.body), "response is usable as the bridge's preparedOrder");
  assertEquals(razorpayOrders[0].amount, 109000);
  assertEquals(quoteCalls[0].p_user_id, alice.id);
  const row = db.tables.payment_attempts[0];
  assertEquals(row.user_id, alice.id);
  assertEquals(row.expected_amount, 1090);
  assertEquals(row.razorpay_order_id, "order_T1");
  assert(row.checkout_payload);
});

Deno.test("member order without Authorization is rejected with 401 AUTH_REQUIRED", async () => {
  setup();
  const r = await createOrder(memberBody());
  assertEquals(r.status, 401);
  assertEquals(r.body.code, "AUTH_REQUIRED");
  assertEquals(razorpayOrders.length, 0);
  assertEquals(db.tables.payment_attempts?.length ?? 0, 0);
});

Deno.test("member order with only the anon key (what the Custom Tab used to send) is rejected", async () => {
  setup();
  const r = await createOrder(memberBody(), "Bearer anon");
  assertEquals(r.status, 401);
  assertEquals(razorpayOrders.length, 0);
});

Deno.test("member order with an invalid/expired token is rejected", async () => {
  setup();
  seedUser(ALICE);
  const r = await createOrder(memberBody(), "Bearer at-not-a-real-user");
  assertEquals(r.status, 401);
  assertEquals(razorpayOrders.length, 0);
});

Deno.test("user_id and amount sent by the browser are ignored", async () => {
  setup();
  const alice = seedUser(ALICE);
  const bob = seedUser(BOB);
  const r = await createOrder(
    memberBody({ amount: 5, attemptContext: { purpose: "member_order", user_id: bob.id, checkout: cart() } }),
    `Bearer at-${alice.id}`,
  );
  assertEquals(r.status, 200);
  assertEquals(r.body.amount, 109000);
  assertEquals(quoteCalls[0].p_user_id, alice.id);
  assertEquals(db.tables.payment_attempts[0].user_id, alice.id);
});

Deno.test("empty cart is rejected", async () => {
  setup();
  const alice = seedUser(ALICE);
  const r = await createOrder(memberBody({ attemptContext: { checkout: cart([]) } }), `Bearer at-${alice.id}`);
  assertEquals(r.status, 400);
  assertEquals(r.body.error, "Your cart is empty.");
  assertEquals(razorpayOrders.length, 0);
});

Deno.test("server-side price validation failure is returned as a readable message", async () => {
  setup();
  const alice = seedUser(ALICE);
  const r = await createOrder(memberBody({ attemptContext: { checkout: cart([{ product_id: "gone", quantity: 1 }]) } }), `Bearer at-${alice.id}`);
  assertEquals(r.status, 400);
  assertEquals(r.body.error, "Some items are no longer available.");
  assertEquals(razorpayOrders.length, 0);
});

Deno.test("Razorpay order-creation failure is returned as a readable message, no attempt row", async () => {
  setup();
  const alice = seedUser(ALICE);
  razorpayFail = { description: "Amount exceeds maximum amount allowed." };
  const r = await createOrder(memberBody(), `Bearer at-${alice.id}`);
  assertEquals(r.status, 400);
  assertEquals(r.body.error, "Amount exceeds maximum amount allowed.");
  assertEquals(db.tables.payment_attempts?.length ?? 0, 0);
});

Deno.test("guest/web payments that never needed a session still work unauthenticated", async () => {
  setup();
  const r = await createOrder({ amount: 250, purpose: "guest_order", attemptContext: { customer_phone: "9000000000" } });
  assertEquals(r.status, 200);
  assertEquals(r.body.amount, 25000);
});

// ---- settlePayment: order ownership & replay --------------------------------

const seedInitiated = (userId: string) => {
  db.tables.payment_attempts = [{
    id: "attempt-1", payment_id: null, razorpay_order_id: "order_T1", purpose: "member_order", user_id: userId,
    checkout_payload: cart(), expected_amount: 1090, status: "initiated", items: [], discount_amount: 0,
  }];
};
const placed: Array<Record<string, unknown>> = [];
const stubPlace = () => {
  placed.length = 0;
  db.rpcs.place_paid_order = (args) => {
    const prior = placed.find((p) => p.p_payment_id === args.p_payment_id);
    if (!prior) placed.push(args);
    return { data: { success: true, order_id: "ord-1", order_number: "EB-1" }, error: null };
  };
};

Deno.test("a member order is always placed for the customer who created it, not a caller-supplied user_id", async () => {
  setup();
  stubPlace();
  const alice = seedUser(ALICE);
  const bob = seedUser(BOB);
  seedInitiated(alice.id);
  const res = await settlePayment(createClient("", ""), {
    razorpayPaymentId: "pay_1", razorpayOrderId: "order_T1", capturedAmountPaise: 109000,
    purpose: "member_order", attempt: { user_id: bob.id },
  });
  assert(res.success);
  assertEquals(placed.length, 1);
  assertEquals(placed[0].p_user_id, alice.id);
});

Deno.test("replaying the same verified payment does not create a second order", async () => {
  setup();
  stubPlace();
  const alice = seedUser(ALICE);
  seedInitiated(alice.id);
  const params = { razorpayPaymentId: "pay_1", razorpayOrderId: "order_T1", capturedAmountPaise: 109000, purpose: "member_order" };
  const first = await settlePayment(createClient("", ""), params);
  const second = await settlePayment(createClient("", ""), params);
  assert(first.success && second.success);
  assertEquals(second.already_settled, true);
  assertEquals(placed.length, 1);
});

// ---- client helpers: bridge payload + error messages ------------------------

const prepared = { order_id: "order_T1", amount: 109000, currency: "INR", key_id: "rzp_live_T2arUsQZHfGFov" };

Deno.test("bridge payload for a member order carries the prepared order and no cart, address or token", () => {
  const options = {
    amount: 1090, purpose: "member_order", prefill: { name: "A" },
    attemptContext: { user_id: "u1", checkout: { shipping_address: { line1: "secret street" } } },
  };
  const encoded = encodeBridgePayload(buildBridgePayload(options, prepared));
  const decoded = decodeBridgePayload<Record<string, unknown>>(encoded);
  assertEquals(decoded.preparedOrder, prepared);
  assertFalse("attemptContext" in decoded);
  const raw = JSON.stringify(decoded);
  assertFalse(raw.includes("secret street"));
  assertFalse(/access_token|refresh_token|at-|Bearer/.test(raw));
});

Deno.test("bridge payload for other purposes keeps attemptContext (unchanged behaviour)", () => {
  const decoded = buildBridgePayload({ amount: 100, purpose: "wallet_topup", attemptContext: { user_id: "u1" } }, prepared);
  assertEquals(decoded.attemptContext, { user_id: "u1" });
});

Deno.test("tampered or missing prepared orders are rejected by the bridge", () => {
  assert(isPreparedOrder(prepared));
  assertFalse(isPreparedOrder(undefined));
  assertFalse(isPreparedOrder({ ...prepared, order_id: "javascript:alert(1)" }));
  assertFalse(isPreparedOrder({ ...prepared, key_id: "attacker" }));
  assertFalse(isPreparedOrder({ ...prepared, amount: 0 }));
  assertFalse(isPreparedOrder({ ...prepared, amount: "109000" }));
});

Deno.test("invalid bridge payload fails to decode", async () => {
  await assertRejects(async () => decodeBridgePayload("not-base64!!"));
});

const httpError = (status: number, body: unknown) => ({
  name: "FunctionsHttpError",
  context: new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
});

Deno.test("401 from create-order becomes an auth error, not a generic failure", async () => {
  const e = await paymentErrorFromInvoke(httpError(401, { error: "Please sign in again to pay.", code: "AUTH_REQUIRED" }), null);
  assert(e instanceof PaymentError);
  assertEquals(e.kind, "auth");
  assert(/sign in again/i.test(e.message));
});

Deno.test("network failure is distinguished from auth and order failures", async () => {
  const e = await paymentErrorFromInvoke({ name: "FunctionsFetchError", context: new TypeError("Failed to fetch") }, null);
  assertEquals(e.kind, "network");
  assert(/internet connection/i.test(e.message));
});

Deno.test("server error message is read from error.context (data is null on non-2xx)", async () => {
  const e = await paymentErrorFromInvoke(httpError(400, { error: "Some items are no longer available." }), null);
  assertEquals(e.kind, "order");
  assertEquals(e.message, "Some items are no longer available.");
});

Deno.test("internal details are never shown to customers", async () => {
  for (const body of [
    { error: "TypeError: Cannot read properties of undefined\n    at handler (index.ts:12:3)" },
    { error: 'duplicate key value violates unique constraint (postgres)' },
    { error: "invalid JWT: token is expired" },
    "<html>502 Bad Gateway</html>",
  ]) {
    const e = await paymentErrorFromInvoke(httpError(500, body), null);
    assertEquals(e.kind, "order");
    assertEquals(e.message, "Could not start the payment. Please try again.");
  }
});

// ---- delivery location pin --------------------------------------------------

Deno.test("a confirmed map pin in the shipping address reaches quote_checkout and place_paid_order unchanged", async () => {
  setup();
  stubPlace();
  const alice = seedUser(ALICE);
  const pinned = { address_line1: "12 MG Road", city: "Bengaluru", postal_code: "560001", latitude: 12.971599, longitude: 77.594566, location_confirmed_at: "2026-10-26T10:00:00.000Z" };
  const r = await createOrder(memberBody({ attemptContext: { purpose: "member_order", checkout: { ...cart(), shipping_address: pinned } } }), `Bearer at-${alice.id}`);
  assertEquals(r.status, 200);
  assertEquals(r.body.amount, 109000); // pricing unaffected
  assertEquals(quoteCalls[0].p_shipping_address, pinned);
  const row = db.tables.payment_attempts[0] as { checkout_payload: { shipping_address: unknown } };
  assertEquals(row.checkout_payload.shipping_address, pinned);

  const res = await settlePayment(createClient("", ""), {
    razorpayPaymentId: "pay_pin", razorpayOrderId: "order_T1", capturedAmountPaise: 109000, purpose: "member_order",
  });
  assert(res.success);
  assertEquals((placed[0].p_payload as { shipping_address: unknown }).shipping_address, pinned);
});
