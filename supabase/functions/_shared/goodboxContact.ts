// GoodBox (appzo.ai) contact creation.
//
// Submits a newly registered member's mobile number to the GoodBox web form so
// GoodBox creates the contact and its own workflow sends the WhatsApp welcome.
// ElaBazar never sends WhatsApp messages itself.
//
// Best effort: never throws, never fails registration. At most one submission
// per user, enforced by claiming a goodbox_contact_sync row first. No retries,
// so GoodBox never gets duplicate contacts; failures are logged in that row.

// deno-lint-ignore-file no-explicit-any
type Client = any;

const DEFAULT_WEBFORM_URL =
  "https://backend.appzo.ai/v1/public/route/web-form?form_id=cmuxqybnp0e8ypa0124r3q2s7";
const REQUEST_TIMEOUT_MS = 8000;

// GoodBox expects the +91 format, e.g. +918618570153.
function toGoodBoxMobile(phone: string | null | undefined): string | null {
  const last10 = (phone || "").replace(/\D/g, "").slice(-10);
  return last10.length === 10 ? `+91${last10}` : null;
}

async function submit(supabase: Client, userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    const mobile = toGoodBoxMobile(profile?.phone);
    if (!mobile) {
      console.error("[goodbox] no valid mobile number for user", userId);
      return;
    }

    // Claim first: only the caller that inserts the row submits.
    const { data: claimed, error: claimError } = await supabase
      .from("goodbox_contact_sync")
      .upsert({ user_id: userId, mobile_number: mobile }, { onConflict: "user_id", ignoreDuplicates: true })
      .select("user_id");
    if (claimError) {
      console.error("[goodbox] could not claim submission, skipping:", claimError);
      return;
    }
    if (!claimed || claimed.length === 0) return; // already submitted for this user

    let status: "sent" | "failed" = "failed";
    let httpStatus: number | null = null;
    let errorText: string | null = null;
    try {
      const res = await fetch(Deno.env.get("GOODBOX_WEBFORM_URL") || DEFAULT_WEBFORM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile_number: mobile }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      httpStatus = res.status;
      const body = await res.text().catch(() => "");
      if (res.ok) {
        status = "sent";
      } else {
        errorText = body.slice(0, 500);
        console.error("[goodbox] web-form rejected contact:", res.status, errorText);
      }
    } catch (e) {
      errorText = (e as Error).message;
      console.error("[goodbox] web-form request failed:", errorText);
    }

    await supabase
      .from("goodbox_contact_sync")
      .update({ status, http_status: httpStatus, error: errorText, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (e) {
    console.error("[goodbox] unexpected error:", e);
  }
}

// Fire-and-forget where the runtime supports it (Supabase EdgeRuntime keeps
// the task alive after the response is sent); otherwise awaited, bounded by
// the request timeout. Never rejects.
export async function createGoodBoxContact(supabase: Client, userId: string): Promise<void> {
  const task = submit(supabase, userId);
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") {
    runtime.waitUntil(task);
    return;
  }
  await task;
}
