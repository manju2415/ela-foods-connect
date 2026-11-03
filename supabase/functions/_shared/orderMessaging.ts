// Order notification messaging: settings, phone choice, message variables,
// and the MSG91 SMS (Flow API) / WhatsApp (template) senders. Pure helpers +
// one fetch per send, so it can be unit-tested without a provider.
//
// Nothing here logs a phone number or a message body.

export type NotificationMode = "off" | "record_only" | "live";
export type NotificationEvent = "order_confirmed" | "order_dispatched";
export type Channel = "sms" | "whatsapp";

export interface OrderNotificationSettings {
  mode: NotificationMode;
  sms: { enabled: boolean; confirmationFlowId: string | null; dispatchFlowId: string | null };
  whatsapp: {
    enabled: boolean;
    integratedNumber: string | null;
    language: string;
    confirmationTemplate: string | null;
    dispatchTemplate: string | null;
  };
}

const str = (v: unknown, max = 100): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Same rule as the SQL order_notifications_mode(): anything unexpected is off. */
export function parseSettings(raw: unknown): OrderNotificationSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const sms = (v.sms && typeof v.sms === "object" ? v.sms : {}) as Record<string, unknown>;
  const wa = (v.whatsapp && typeof v.whatsapp === "object" ? v.whatsapp : {}) as Record<string, unknown>;
  return {
    mode: v.mode === "live" || v.mode === "record_only" ? v.mode : "off",
    sms: {
      enabled: sms.enabled === true,
      confirmationFlowId: str(sms.confirmation_flow_id),
      dispatchFlowId: str(sms.dispatch_flow_id),
    },
    whatsapp: {
      enabled: wa.enabled === true,
      integratedNumber: normalizeIndianMobile(str(wa.integrated_number)),
      language: str(wa.language, 10) ?? "en",
      confirmationTemplate: str(wa.confirmation_template),
      dispatchTemplate: str(wa.dispatch_template),
    },
  };
}

/** 10-digit Indian mobile from +91 / 91 / 0 prefixed or spaced input; null otherwise. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export interface ClaimedRow {
  id: string;
  order_id: string;
  event: NotificationEvent;
  channel: Channel;
  seq: number;
  attempts: number;
  order_number: string;
  order_value: number | string | null;
  order_status: string;
  payment_status: string;
  fulfillment_type: string | null;
  address_phone: string | null;
  profile_phone: string | null;
  partner_type: string | null;
  partner_name: string | null;
  rider_name: string | null;
  rider_phone: string | null;
}

/**
 * The customer's number. A store-pickup order's "address" carries the store's
 * phone, so pickup uses the profile phone only.
 */
export function pickCustomerPhone(row: Pick<ClaimedRow, "fulfillment_type" | "address_phone" | "profile_phone">): string | null {
  if (row.fulfillment_type === "store_pickup") return normalizeIndianMobile(row.profile_phone);
  return normalizeIndianMobile(row.address_phone) ?? normalizeIndianMobile(row.profile_phone);
}

/** DLT variables are commonly capped at 30 characters. */
export const VAR_MAX = 30;
export function fitVar(value: string, max = VAR_MAX): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

export function formatAmount(value: number | string | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

const PARTNER_LABELS: Record<string, string> = {
  in_house: "Ela Bazar delivery",
  rapido: "Rapido",
  porter: "Porter",
};

/**
 * Message variables in template order (MSG91 Flow ##VAR1##, ##VAR2## ...;
 * WhatsApp body {{1}}, {{2}} ...):
 *   order_confirmed:  1 order number, 2 order value
 *   order_dispatched: 1 order number, 2 partner, 3 delivery person, 4 contact number
 * Returns null when a dispatch message has no dispatch record.
 */
export function buildVariables(row: ClaimedRow): string[] | null {
  if (row.event === "order_confirmed") {
    return [fitVar(row.order_number), fitVar(formatAmount(row.order_value))];
  }
  const riderPhone = normalizeIndianMobile(row.rider_phone);
  if (!row.partner_type || !riderPhone) return null;
  const partner = row.partner_type === "other"
    ? (row.partner_name || "our delivery partner")
    : PARTNER_LABELS[row.partner_type] ?? "our delivery partner";
  return [
    fitVar(row.order_number),
    fitVar(partner),
    fitVar(row.rider_name || "our delivery partner"),
    riderPhone,
  ];
}

export type SendOutcome =
  | { outcome: "sent"; requestId: string | null }
  | { outcome: "retry" | "failed" | "unknown"; error: string };

const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 200);

/** Shared result classification for MSG91 responses. */
export function classifyHttp(status: number, bodyText: string): SendOutcome {
  let json: Record<string, any> | null = null;
  try { json = JSON.parse(bodyText); } catch { /* not JSON */ }
  const message = json ? String(json.message ?? json.errors ?? json.error ?? "") : bodyText;

  if (status === 429 || status >= 500) return { outcome: "retry", error: `Provider HTTP ${status}: ${short(message)}` };
  if (status === 401 || status === 403) return { outcome: "failed", error: `Provider rejected the auth key (HTTP ${status})` };
  if (status >= 400) return { outcome: "failed", error: `Provider HTTP ${status}: ${short(message)}` };

  if (!json) return { outcome: "unknown", error: `Unexpected provider response: ${short(bodyText)}` };
  const ok = (json.type === "success" || json.status === "success") && json.hasError !== true;
  if (ok) {
    const id = json.request_id ?? json.data?.request_id ?? json.message ?? null;
    return { outcome: "sent", requestId: id == null ? null : String(id).slice(0, 120) };
  }
  // A 200 with type "error" is a definite rejection (e.g. DLT 211/203, bad template).
  return { outcome: "failed", error: `Provider error: ${short(message || bodyText)}` };
}

export const SEND_TIMEOUT_MS = 10_000;

async function post(url: string, authKey: string, body: unknown): Promise<SendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return classifyHttp(resp.status, await resp.text());
  } catch (e) {
    // Timed out: the provider may already have it. Don't resend automatically.
    if (e instanceof DOMException && e.name === "AbortError") {
      return { outcome: "unknown", error: `No reply from provider within ${SEND_TIMEOUT_MS / 1000}s` };
    }
    // Couldn't reach the provider at all: safe to retry.
    return { outcome: "retry", error: `Network error: ${short(String(e))}` };
  } finally {
    clearTimeout(timer);
  }
}

export const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow/";
export const MSG91_WHATSAPP_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

/** Same request shape as add-network-user's invite SMS. */
export function msg91SmsBody(flowId: string, phone10: string, vars: string[]) {
  const recipient: Record<string, string> = { mobiles: `91${phone10}` };
  vars.forEach((v, i) => { recipient[`VAR${i + 1}`] = v; });
  return { template_id: flowId, short_url: "0", recipients: [recipient] };
}

export function msg91WhatsAppBody(integratedNumber: string, template: string, language: string, phone10: string, vars: string[]) {
  const components: Record<string, { type: "text"; value: string }> = {};
  vars.forEach((v, i) => { components[`body_${i + 1}`] = { type: "text", value: v }; });
  return {
    integrated_number: `91${integratedNumber}`,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: template,
        language: { code: language, policy: "deterministic" },
        to_and_components: [{ to: [`91${phone10}`], components }],
      },
    },
  };
}

export const sendSms = (authKey: string, flowId: string, phone10: string, vars: string[]) =>
  post(MSG91_FLOW_URL, authKey, msg91SmsBody(flowId, phone10, vars));

export const sendWhatsApp = (
  authKey: string, integratedNumber: string, template: string, language: string, phone10: string, vars: string[],
) => post(MSG91_WHATSAPP_URL, authKey, msg91WhatsAppBody(integratedNumber, template, language, phone10, vars));

/** Strips quotes / a pasted "NAME=" prefix from a secret (as add-network-user does). */
export function sanitizeSecret(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const eq = trimmed.indexOf("=");
  if (eq > -1 && /^[A-Z_][A-Z0-9_]*$/i.test(trimmed.slice(0, eq))) return trimmed.slice(eq + 1).trim();
  return trimmed;
}

/** Role claim of a (gateway-verified) JWT, without re-verifying it. */
export function jwtRole(authHeader: string | null): string | null {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(atob(b64));
    return typeof claims?.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}
