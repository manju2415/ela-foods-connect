import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Automatic recovery from a stored session whose access token the API rejects.
 *
 * supabase-js only refreshes when the stored `expires_at` is near, so an access
 * token that is corrupt/rejected but still "unexpired" is sent forever and every
 * PostgREST call answers 401 PGRST301 with no refresh ever attempted.
 *
 * This wraps global fetch (supabase-js resolves `fetch` at call time, so the
 * generated client needs no change) and reacts ONLY to a definite JWT failure
 * from /rest/v1 for a request that carried a user token:
 *   1. refresh the session once (single-flight — N failing calls share one refresh);
 *   2. refreshed  -> retry the failed request once with the new token;
 *   3. refresh definitively rejected (invalid/revoked refresh token or no
 *      session) -> remove ONLY the local Supabase session via
 *      signOut({ scope: "local" }); AuthContext gets SIGNED_OUT and protected
 *      pages redirect to /auth by themselves;
 *   4. network/temporary failure -> change nothing; the session is kept.
 * A per-token cooldown prevents refresh loops.
 */

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// PGRST301: JWT cryptographic failure; PGRST303: JWT claims invalid (e.g. expired).
const JWT_FAILURE_CODES = new Set(["PGRST301", "PGRST303"]);
const COOLDOWN_MS = 15_000;

type Outcome = "refreshed" | "signed-out" | "kept";

let inFlight: Promise<Outcome> | null = null;
let lastAttempt: { token: string; at: number } | null = null;

async function recoverSession(failedToken: string): Promise<Outcome> {
  if (inFlight) return inFlight;

  // Another caller may already have replaced the token that just failed.
  const { data: current } = await supabase.auth.getSession();
  if (current.session && current.session.access_token !== failedToken) return "refreshed";
  // A refresh may have started while we awaited getSession — join it.
  if (inFlight) return inFlight;
  // The same token was already handled moments ago — don't loop.
  if (lastAttempt && lastAttempt.token === failedToken && Date.now() - lastAttempt.at < COOLDOWN_MS) {
    return "kept";
  }

  lastAttempt = { token: failedToken, at: Date.now() };
  inFlight = (async (): Promise<Outcome> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (data.session) return "refreshed";
      if (error && isAuthRetryableFetchError(error)) return "kept"; // network/5xx: keep the session
      if (!error) return "kept";
      // Server (or missing local session) says this session cannot be refreshed.
      // Removes only supabase's own auth key and emits SIGNED_OUT.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return "signed-out";
    } catch {
      return "kept"; // unexpected/transient failure — never log the customer out on a guess
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function bearerToken(headers: Headers): string | null {
  const auth = headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return token && token !== ANON_KEY ? token : null;
}

async function isJwtFailure(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = await res.clone().json();
    return JWT_FAILURE_CODES.has(body?.code);
  } catch {
    return false;
  }
}

export function installAuthRecovery(): void {
  if (typeof window === "undefined" || !SUPABASE_URL) return;
  const w = window as Window & { __elaAuthRecovery?: boolean };
  if (w.__elaAuthRecovery) return;
  w.__elaAuthRecovery = true;

  const restPrefix = `${SUPABASE_URL}/rest/v1/`;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    try {
      // Only plain URL requests (what postgrest-js sends) can be safely replayed.
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
      if (!url || !url.startsWith(restPrefix) || res.status !== 401) return res;

      const headers = new Headers(init?.headers);
      const failedToken = bearerToken(headers);
      if (!failedToken || !(await isJwtFailure(res))) return res;

      const outcome = await recoverSession(failedToken);
      if (outcome !== "refreshed") return res;

      const { data } = await supabase.auth.getSession();
      const newToken = data.session?.access_token;
      if (!newToken || newToken === failedToken) return res;
      headers.set("Authorization", `Bearer ${newToken}`);
      return await originalFetch(input, { ...init, headers }); // one retry, bypasses this wrapper
    } catch {
      return res; // recovery must never break the original request
    }
  };
}
