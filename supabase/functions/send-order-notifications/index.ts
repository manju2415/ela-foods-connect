// Order notification worker. Called by pg_cron every minute (see
// otp_diagnostics/52_PROPOSED_order_notifications_cron.sql, not scheduled yet)
// with the service-role key. Claims due rows from order_notifications (queued
// by the database: paid-order trigger, admin Dispatch / Resend) and sends
// them through MSG91, writing each result back.
//
// Sends nothing unless ALL of these hold:
//   * platform_settings.order_notifications.mode = 'live'
//   * the channel is enabled and has its flow/template id
//   * the server secret ORDER_NOTIFICATIONS_LIVE = 'true' (second key)
//   * MSG91_AUTH_TOKEN is set
// In 'record_only' rows are marked skipped without calling any provider.
// Logs carry outbox ids only: no phone numbers, no message text.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildVariables,
  type ClaimedRow,
  jwtRole,
  parseSettings,
  pickCustomerPhone,
  sanitizeSecret,
  type SendOutcome,
  sendSms,
  sendWhatsApp,
} from "../_shared/orderMessaging.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BATCH = 25;

type Result =
  | SendOutcome
  | { outcome: "skipped"; error: string };

serve(async (req) => {
  // Only the cron job (service role) may run the worker. The gateway has
  // already verified the JWT signature; the anon key is a valid JWT too, so
  // the role must be checked here.
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "Forbidden" }, 403);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settingRow, error: settingErr } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "order_notifications")
    .maybeSingle();
  if (settingErr) {
    console.error("[send-order-notifications] settings read failed:", settingErr.message);
    return json({ error: "Settings unavailable" }, 500);
  }
  const settings = parseSettings(settingRow?.value);
  if (settings.mode === "off") {
    // Leave rows alone; claim_order_notifications skips anything 24h old.
    return json({ mode: "off", processed: 0 });
  }

  const liveActivated = Deno.env.get("ORDER_NOTIFICATIONS_LIVE") === "true";
  const authKey = sanitizeSecret(Deno.env.get("MSG91_AUTH_TOKEN"));

  const { data: claimed, error: claimErr } = await supabase.rpc("claim_order_notifications", { p_limit: BATCH });
  if (claimErr) {
    console.error("[send-order-notifications] claim failed:", claimErr.message);
    return json({ error: "Claim failed" }, 500);
  }

  const counts: Record<string, number> = {};
  for (const row of (claimed ?? []) as ClaimedRow[]) {
    let result: Result;
    let last4: string | null = null;
    try {
      const phone = pickCustomerPhone(row);
      last4 = phone ? phone.slice(-4) : null;
      result = await decide(row, phone);
    } catch (e) {
      result = { outcome: "retry", error: `Worker error: ${String(e).slice(0, 200)}` };
    }

    const { error: doneErr } = await supabase.rpc("complete_order_notification", {
      p_id: row.id,
      p_outcome: result.outcome,
      p_provider_request_id: result.outcome === "sent" ? result.requestId : null,
      p_error: result.outcome === "sent" ? null : result.error,
      p_phone_last4: last4,
    });
    if (doneErr) {
      // The row stays 'sending' and becomes 'unknown' after 10 minutes: never resent blindly.
      console.error("[send-order-notifications] could not record result for", row.id, doneErr.message);
    }
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
  }

  console.log("[send-order-notifications]", settings.mode, JSON.stringify(counts));
  return json({ mode: settings.mode, processed: claimed?.length ?? 0, ...counts });

  async function decide(row: ClaimedRow, phone: string | null): Promise<Result> {
    if (row.payment_status !== "completed" || ["cancelled", "returned"].includes(row.order_status)) {
      return { outcome: "skipped", error: "Not sent: the order is no longer paid and active" };
    }
    if (!phone) return { outcome: "failed", error: "No valid 10-digit mobile number on the order" };
    const vars = buildVariables(row);
    if (!vars) return { outcome: "failed", error: "No dispatch details for this order" };

    if (settings.mode === "record_only") return { outcome: "skipped", error: "Record only: not sent" };
    if (!liveActivated) return { outcome: "skipped", error: "Not sent: live sending is not activated on the server" };
    if (!authKey) return { outcome: "skipped", error: "Not sent: MSG91 auth key is not configured" };

    const confirmed = row.event === "order_confirmed";
    if (row.channel === "sms") {
      const flowId = confirmed ? settings.sms.confirmationFlowId : settings.sms.dispatchFlowId;
      if (!settings.sms.enabled || !flowId) return { outcome: "skipped", error: "Not sent: SMS template not configured" };
      return await sendSms(authKey, flowId, phone, vars);
    }
    const wa = settings.whatsapp;
    const template = confirmed ? wa.confirmationTemplate : wa.dispatchTemplate;
    if (!wa.enabled || !template || !wa.integratedNumber) {
      return { outcome: "skipped", error: "Not sent: WhatsApp template not configured" };
    }
    return await sendWhatsApp(authKey, wa.integratedNumber, template, wa.language, phone, vars);
  }
});
