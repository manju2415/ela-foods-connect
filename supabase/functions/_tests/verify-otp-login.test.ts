// Tests for supabase/functions/verify-otp-login against an in-memory Supabase.
// Run: npx -y deno test --allow-env --allow-read --import-map=supabase/functions/_tests/import_map.json supabase/functions/_tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { db, seedUser } from "./fake_supabase.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("MSG91_AUTH_TOKEN", "msg91");

// MSG91 stand-in: "123456" is the only correct OTP for real numbers.
globalThis.fetch = ((input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const ok = url.searchParams.get("otp") === "123456";
  return Promise.resolve(new Response(JSON.stringify(ok ? { type: "success", message: "OTP verified success" } : { type: "error", message: "OTP not match" })));
}) as typeof fetch;

// Capture the handler instead of starting a server.
type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;
Object.defineProperty(Deno, "serve", { value: (h: Handler) => { handler = h; }, configurable: true, writable: true });
await import("../verify-otp-login/index.ts");

const PHONE = "+917000000304";
const EMAIL = "917000000304@elabazar.local";

const setRegistration = (enabled: boolean) => {
  db.tables.platform_settings = [{ key: "registration_settings", value: { registration_enabled: enabled } }];
};

const login = async (body: Record<string, unknown>) => {
  const res = await handler!(new Request("http://fake.local/verify-otp-login", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

const userByEmail = (email: string) => db.users.find((u) => u.email === email);
const profileOf = (id: string) => db.tables.profiles.find((p) => p.id === id);
const lastLog = () => db.tables.otp_send_log.at(-1)?.outcome;

const setup = (registrationEnabled: boolean) => { db.reset(); setRegistration(registrationEnabled); };

Deno.test("existing confirmed user logs in (registration OFF)", async () => {
  setup(false);
  const u = seedUser(EMAIL, { confirmed: true, phone: PHONE });
  const r = await login({ phone: PHONE, otp: "123456" });
  assertEquals(r.status, 200);
  assertEquals(r.body.success, true);
  assertEquals(r.body.is_new_user, false);
  assertEquals(r.body.access_token, `at-${u.id}`);
  assertEquals(db.users.length, 1);
  assert(!db.calls.includes("createUser"));
  assertEquals(lastLog(), "session:SUCCESS");
});

Deno.test("existing confirmed user logs in (registration ON)", async () => {
  setup(true);
  const u = seedUser(EMAIL, { confirmed: true, phone: PHONE });
  const r = await login({ phone: PHONE, otp: "123456" });
  assertEquals(r.status, 200);
  assertEquals(r.body.is_new_user, false);
  assertEquals(r.body.access_token, `at-${u.id}`);
  assertEquals(db.users.length, 1);
});

Deno.test("new number with registration OFF gets a confirmed customer account", async () => {
  setup(false);
  const inviter = seedUser("917000000001@elabazar.local", { phone: "+917000000001" });
  db.tables.referral_codes.push({ id: "code-1", user_id: inviter.id, code: "ELAINV1", is_active: true });

  const r = await login({ phone: PHONE, otp: "123456", referral_code: "elainv1" });
  assertEquals(r.status, 200);
  assertEquals(r.body.success, true);
  assertEquals(r.body.is_new_user, true);

  const u = userByEmail(EMAIL)!;
  assert(u.email_confirmed_at, "account must be confirmed");
  assertEquals(u.user_metadata.phone, "917000000304");
  assertEquals(db.users.filter((x) => x.email === EMAIL).length, 1);
  assertEquals(profileOf(u.id)?.phone, PHONE);
  assertEquals(profileOf(u.id)?.referred_by, inviter.id);
  assertEquals(db.tables.referrals.length, 1);
  assertEquals(db.tables.referrals[0].referred_id, u.id);
  assertEquals(lastLog(), "session:SUCCESS");
});

Deno.test("deleted/recreated account: stray unconfirmed account is repaired, not duplicated (registration OFF)", async () => {
  setup(false);
  // What the old magic-link existence check left behind: unconfirmed, no phone.
  const stray = seedUser(EMAIL, { confirmed: false, phone: null });

  const r = await login({ phone: PHONE, otp: "123456" });
  assertEquals(r.status, 200);
  assertEquals(r.body.success, true);
  assertEquals(r.body.is_new_user, true);
  assertEquals(r.body.access_token, `at-${stray.id}`);

  assertEquals(db.users.length, 1, "no second account");
  assert(userByEmail(EMAIL)!.email_confirmed_at);
  assertEquals(profileOf(stray.id)?.phone, PHONE);
});

Deno.test("deleted/recreated account: stray unconfirmed account can log in (registration ON)", async () => {
  setup(true);
  const stray = seedUser(EMAIL, { confirmed: false, phone: null });
  const r = await login({ phone: PHONE, otp: "123456" });
  assertEquals(r.status, 200);
  assertEquals(r.body.is_new_user, true);
  assertEquals(r.body.access_token, `at-${stray.id}`);
  assertEquals(db.users.length, 1);
  assertEquals(profileOf(stray.id)?.phone, PHONE);
});

Deno.test("registration ON: unknown number is not found and no account is created", async () => {
  setup(true);
  const r = await login({ phone: PHONE, otp: "123456" });
  assertEquals(r.status, 404);
  assertEquals(r.body.code, "NO_AUTH_USER");
  assertEquals(db.users.length, 0, "the lookup must not create an auth user");
  assert(!db.calls.includes("createUser"));
});

Deno.test("registration ON: guest account under another email is still repaired and logs in", async () => {
  setup(true);
  const guest = seedUser("guest_abc@elabazar.local", { confirmed: true, phone: PHONE });
  const r = await login({ phone: PHONE, otp: "123456" });
  assertEquals(r.status, 200);
  assertEquals(r.body.is_new_user, false);
  assertEquals(r.body.access_token, `at-${guest.id}`);
  assertEquals(db.users.length, 1);
  assertEquals(userByEmail(EMAIL)?.id, guest.id);
});

Deno.test("invalid OTP (real number) is rejected and touches no account", async () => {
  setup(false);
  const r = await login({ phone: PHONE, otp: "999999" });
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "OTP_REJECTED");
  assertEquals(db.users.length, 0);
  assertEquals(db.calls.length, 0);
});

Deno.test("invalid OTP (test number) is rejected", async () => {
  setup(false);
  const r = await login({ phone: "+919999000005", otp: "111111" });
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "OTP_REJECTED");
  assertEquals(db.users.length, 0);
});

Deno.test("missing phone/OTP is a bad request", async () => {
  setup(false);
  const r = await login({});
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "BAD_REQUEST");
});
