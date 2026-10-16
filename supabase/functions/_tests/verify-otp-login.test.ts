// Tests for supabase/functions/verify-otp-login against an in-memory Supabase.
// Run: npx -y deno test --allow-env --allow-read --import-map=supabase/functions/_tests/import_map.json supabase/functions/_tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { db, seedUser } from "./fake_supabase.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("MSG91_AUTH_TOKEN", "msg91");

// MSG91 stand-in: "123456" is the only correct OTP for real numbers.
const msg91Calls: string[] = [];
globalThis.fetch = ((input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  msg91Calls.push(url.searchParams.get("mobile") ?? "");
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

const setup = (registrationEnabled: boolean) => { db.reset(); msg91Calls.length = 0; setRegistration(registrationEnabled); };

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

Deno.test("invalid OTP (demo number) is rejected", async () => {
  setup(false);
  const r = await login({ phone: "+919999000005", otp: "111111" });
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "OTP_REJECTED");
  assertEquals(db.users.length, 0);
  assertEquals(msg91Calls.length, 0, "the demo number never goes to MSG91");
});

// --- Demo bypass: only 9999000005, never a privileged account ---------------

const DEMO_EMAIL = "919999000005@elabazar.local";

for (const phone of ["+919999000005", "919999000005", "9999000005"]) {
  Deno.test(`demo number ${phone} signs in with the demo code, without MSG91`, async () => {
    setup(false);
    const u = seedUser(DEMO_EMAIL, { confirmed: true, phone: "+919999000005" });
    const r = await login({ phone, otp: "000000" });
    assertEquals(r.status, 200);
    assertEquals(r.body.access_token, `at-${u.id}`);
    assertEquals(msg91Calls.length, 0);
    assertEquals(lastLog(), "session:SUCCESS");
  });
}

// The seeded admin/founder/delivery/member test numbers and the old 8888888888
// used to accept 000000; they must now be verified by MSG91 like anyone else.
for (const last10 of ["9999000001", "9999000002", "9999000003", "9999000004", "9999000006", "8888888888"]) {
  Deno.test(`former test number ${last10} cannot use the demo code`, async () => {
    setup(false);
    seedUser(`91${last10}@elabazar.local`, { confirmed: true, phone: `+91${last10}` });
    const r = await login({ phone: `+91${last10}`, otp: "000000" });
    assertEquals(r.status, 400);
    assertEquals(r.body.code, "OTP_REJECTED");
    assertEquals(msg91Calls, [`91${last10}`], "checked by MSG91");
    assert(!db.calls.some((c) => c.startsWith("updateUserById")), "no password rotation, no session");
  });
}

Deno.test("former test number (super admin) still signs in with a real SMS code", async () => {
  setup(false);
  const u = seedUser("919999000001@elabazar.local", { confirmed: true, phone: "+919999000001" });
  db.tables.user_roles.push({ user_id: u.id, role: "super_admin" });
  const r = await login({ phone: "+919999000001", otp: "123456" });
  assertEquals(r.status, 200);
  assertEquals(r.body.access_token, `at-${u.id}`);
  assertEquals(msg91Calls, ["919999000001"]);
});

for (const phone of ["+19999000005", "009999000005", "+9199999000005"]) {
  Deno.test(`look-alike number ${phone} does not get the demo bypass`, async () => {
    setup(false);
    const r = await login({ phone, otp: "000000" });
    assertEquals(r.status, 400);
    assertEquals(r.body.code, "OTP_REJECTED");
    assertEquals(msg91Calls.length, 1);
    assertEquals(db.users.length, 0);
  });
}

for (const role of ["super_admin", "admin", "mlm_admin", "founding_member", "delivery_partner"]) {
  Deno.test(`demo number holding the ${role} role is refused the demo code`, async () => {
    setup(false);
    const u = seedUser(DEMO_EMAIL, { confirmed: true, phone: "+919999000005" });
    db.tables.user_roles.push({ user_id: u.id, role: "member" }, { user_id: u.id, role });
    const r = await login({ phone: "+919999000005", otp: "000000" });
    assertEquals(r.status, 403);
    assertEquals(r.body.code, "DEMO_PRIVILEGED");
    assertEquals(r.body.access_token, undefined);
    assert(!db.calls.some((c) => c.startsWith("updateUserById")), "no password rotation, no session");
    assertEquals(lastLog(), "session:DEMO_PRIVILEGED");
  });
}

Deno.test("demo number linked to a delivery_partners row is refused the demo code", async () => {
  setup(false);
  const u = seedUser(DEMO_EMAIL, { confirmed: true, phone: "+919999000005" });
  db.tables.delivery_partners.push({ id: "dp-1", user_id: u.id });
  const r = await login({ phone: "+919999000005", otp: "000000" });
  assertEquals(r.status, 403);
  assertEquals(r.body.code, "DEMO_PRIVILEGED");
});

Deno.test("demo code is refused when the role check cannot be read", async () => {
  setup(false);
  seedUser(DEMO_EMAIL, { confirmed: true, phone: "+919999000005" });
  const fake = await import("./fake_supabase.ts");
  const client = fake.createClient("", "");
  const proto = Object.getPrototypeOf(client.from("user_roles"));
  const originalRun = proto.run;
  proto.run = function (this: { table: string }) {
    if (this.table === "user_roles") return Promise.resolve({ data: null, error: { message: "db down" } });
    return originalRun.call(this);
  };
  try {
    const r = await login({ phone: "+919999000005", otp: "000000" });
    assertEquals(r.status, 503);
    assertEquals(r.body.code, "DEMO_ROLE_CHECK_FAILED");
    assertEquals(r.body.access_token, undefined);
    assert(!db.calls.some((c) => c.startsWith("updateUserById")), "no password rotation, no session");
  } finally {
    proto.run = originalRun;
  }
});

Deno.test("demo number with only the member role still signs in", async () => {
  setup(false);
  const u = seedUser(DEMO_EMAIL, { confirmed: true, phone: "+919999000005" });
  db.tables.user_roles.push({ user_id: u.id, role: "member" });
  const r = await login({ phone: "+919999000005", otp: "000000" });
  assertEquals(r.status, 200);
  assertEquals(r.body.access_token, `at-${u.id}`);
});

Deno.test("email lookup failing for an existing account falls back to the account found by phone", async () => {
  setup(true);
  const u = seedUser(EMAIL, { confirmed: true, phone: PHONE });
  const { createClient } = await import("./fake_supabase.ts");
  const admin = createClient("", "").auth.admin;
  const original = admin.generateLink;
  admin.generateLink = () => Promise.resolve({ data: { user: null, properties: null }, error: { message: "transient", status: 500, name: "AuthApiError" } });
  try {
    const r = await login({ phone: PHONE, otp: "123456" });
    assertEquals(r.status, 200);
    assertEquals(r.body.access_token, `at-${u.id}`);
    assert(db.tables.otp_send_log.some((l) => l.outcome === "session:LOOKUP_FALLBACK"));
    assertEquals(db.users.length, 1);
  } finally {
    admin.generateLink = original;
  }
});

Deno.test("missing phone/OTP is a bad request", async () => {
  setup(false);
  const r = await login({});
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "BAD_REQUEST");
});

Deno.test("unconfirmed account missed by the lookup check is confirmed at sign-in", async () => {
  setup(true);
  const stray = seedUser(EMAIL, { confirmed: false, phone: PHONE });
  // Simulate the lookup reporting the account as confirmed when it isn't.
  const { createClient } = await import("./fake_supabase.ts");
  const admin = createClient("", "").auth.admin;
  const original = admin.generateLink;
  admin.generateLink = async (args: { type: string; email: string }) => {
    const res = await original(args);
    if (res.data.user) res.data.user.email_confirmed_at = "2020-01-01T00:00:00Z";
    return res;
  };
  try {
    const r = await login({ phone: PHONE, otp: "123456" });
    assertEquals(r.status, 200);
    assertEquals(r.body.access_token, `at-${stray.id}`);
    assert(userByEmail(EMAIL)!.email_confirmed_at);
    assertEquals(db.users.length, 1);
  } finally {
    admin.generateLink = original;
  }
});
