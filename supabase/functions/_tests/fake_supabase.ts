// In-memory stand-in for supabase-js, used only by verify-otp-login tests.
// Auth admin behaviour mirrors Supabase Auth (internal/api/mail.go
// adminGenerateLink): a "magiclink" for an unknown email becomes a signup and
// creates an UNCONFIRMED user; "recovery" for an unknown email returns 404 and
// creates nothing. New auth users get a profile like the handle_new_user
// trigger (phone taken from user_metadata.phone, else null).

// deno-lint-ignore-file no-explicit-any
type Row = Record<string, any>;

export interface FakeUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  password: string | null;
  user_metadata: Row;
}

export const db = {
  users: [] as FakeUser[],
  tables: {} as Record<string, Row[]>,
  calls: [] as string[],
  reset() {
    this.users = [];
    this.tables = { profiles: [], platform_settings: [], referral_codes: [], referrals: [], otp_send_log: [] };
    this.calls = [];
  },
};
db.reset();

const err = (message: string, status = 400) => ({ message, status, name: "AuthApiError" });

const insertUser = (email: string, confirmed: boolean, user_metadata: Row = {}, password: string | null = null) => {
  const user: FakeUser = {
    id: crypto.randomUUID(),
    email,
    email_confirmed_at: confirmed ? new Date().toISOString() : null,
    password,
    user_metadata,
  };
  db.users.push(user);
  // handle_new_user trigger
  db.tables.profiles.push({ id: user.id, email, full_name: user_metadata.full_name ?? "", phone: user_metadata.phone ?? null, referred_by: null });
  return user;
};

export const seedUser = (email: string, opts: { confirmed?: boolean; phone?: string | null } = {}) => {
  const u = insertUser(email, opts.confirmed ?? true);
  const p = db.tables.profiles.find((r) => r.id === u.id)!;
  p.phone = opts.phone ?? null;
  return u;
};

const publicUser = (u: FakeUser) => ({ id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at ?? undefined, user_metadata: u.user_metadata });

const auth = {
  admin: {
    generateLink: async ({ type, email }: { type: string; email: string }) => {
      db.calls.push(`generateLink:${type}`);
      let user = db.users.find((u) => u.email === email);
      if (!user) {
        if (type === "magiclink") user = insertUser(email, false);
        else if (type === "recovery") return { data: { user: null, properties: null }, error: err("User with this email not found", 404) };
        else throw new Error(`unsupported type ${type}`);
      }
      return { data: { user: publicUser(user), properties: {} }, error: null };
    },
    createUser: async (attrs: Row) => {
      db.calls.push("createUser");
      if (db.users.some((u) => u.email === attrs.email)) {
        return { data: { user: null }, error: err("A user with this email address has already been registered", 422) };
      }
      const u = insertUser(attrs.email, attrs.email_confirm === true, attrs.user_metadata ?? {}, attrs.password ?? null);
      return { data: { user: publicUser(u) }, error: null };
    },
    getUserById: async (id: string) => {
      const u = db.users.find((x) => x.id === id);
      return u ? { data: { user: publicUser(u) }, error: null } : { data: { user: null }, error: err("User not found", 404) };
    },
    updateUserById: async (id: string, attrs: Row) => {
      db.calls.push(`updateUserById:${Object.keys(attrs).sort().join(",")}`);
      const u = db.users.find((x) => x.id === id);
      if (!u) return { data: { user: null }, error: err("User not found", 404) };
      if (attrs.email !== undefined) u.email = attrs.email;
      if (attrs.password !== undefined) u.password = attrs.password;
      if (attrs.email_confirm === true && !u.email_confirmed_at) u.email_confirmed_at = new Date().toISOString();
      if (attrs.user_metadata) u.user_metadata = { ...u.user_metadata, ...attrs.user_metadata };
      return { data: { user: publicUser(u) }, error: null };
    },
  },
  signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
    const u = db.users.find((x) => x.email === email);
    if (!u || u.password !== password) return { data: { session: null }, error: err("Invalid login credentials") };
    if (!u.email_confirmed_at) return { data: { session: null }, error: err("Email not confirmed") };
    return { data: { session: { access_token: `at-${u.id}`, refresh_token: `rt-${u.id}` } }, error: null };
  },
};

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private opts: Row = {};
  private max = Infinity;
  constructor(private table: string) {}

  select(..._args: unknown[]) { return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  upsert(p: Row | Row[], opts: Row = {}) { this.op = "upsert"; this.payload = p; this.opts = opts; return this; }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  is(col: string, val: unknown) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  or(expr: string) {
    const parts = expr.split(",").map((p) => { const [col, , ...v] = p.split("."); return { col, val: v.join(".") }; });
    this.filters.push((r) => parts.some(({ col, val }) => String(r[col] ?? "") === val));
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { return this.run().then((res) => ({ ...res, data: Array.isArray(res.data) ? res.data[0] ?? null : res.data })); }

  private rows() { return (db.tables[this.table] ??= []); }
  private matches() { return this.rows().filter((r) => this.filters.every((f) => f(r))); }

  run(): Promise<{ data: any; error: any }> {
    const rows = this.rows();
    if (this.op === "select") return Promise.resolve({ data: this.matches().slice(0, this.max), error: null });
    if (this.op === "insert") {
      for (const r of [this.payload].flat() as Row[]) rows.push({ ...r });
      return Promise.resolve({ data: null, error: null });
    }
    if (this.op === "update") {
      for (const r of this.matches()) Object.assign(r, this.payload);
      return Promise.resolve({ data: null, error: null });
    }
    const keys = String(this.opts.onConflict ?? "id").split(",");
    for (const r of [this.payload].flat() as Row[]) {
      const hit = rows.find((x) => keys.every((k) => x[k] === r[k]));
      if (hit) { if (!this.opts.ignoreDuplicates) Object.assign(hit, r); } else rows.push({ ...r });
    }
    return Promise.resolve({ data: null, error: null });
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { return this.run().then(res, rej); }
}

export type SupabaseClient = any;
export const createClient = (_url: string, _key: string, _opts?: unknown) => ({
  auth,
  from: (table: string) => new Query(table),
});
