// Admin-side helpers for order notifications and dispatch. The server
// (admin_dispatch_order, the worker) re-validates everything; these only
// drive the forms and labels.

export type NotificationMode = "off" | "record_only" | "live";
export type PartnerType = "in_house" | "rapido" | "porter" | "other";

export const ORDER_NOTIFICATIONS_KEY = "order_notifications";

export interface OrderNotificationSettings {
  mode: NotificationMode;
  sms: { enabled: boolean; confirmation_flow_id: string; dispatch_flow_id: string };
  whatsapp: {
    enabled: boolean;
    integrated_number: string;
    language: string;
    confirmation_template: string;
    dispatch_template: string;
  };
}

export const defaultOrderNotificationSettings: OrderNotificationSettings = {
  mode: "off",
  sms: { enabled: false, confirmation_flow_id: "", dispatch_flow_id: "" },
  whatsapp: { enabled: false, integrated_number: "", language: "en", confirmation_template: "", dispatch_template: "" },
};

const text = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Mirrors the server: anything unexpected is off / disabled. */
export function parseOrderNotificationSettings(raw: unknown): OrderNotificationSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sms = (v.sms && typeof v.sms === "object" ? v.sms : {}) as Record<string, unknown>;
  const wa = (v.whatsapp && typeof v.whatsapp === "object" ? v.whatsapp : {}) as Record<string, unknown>;
  return {
    mode: v.mode === "live" || v.mode === "record_only" ? v.mode : "off",
    sms: {
      enabled: sms.enabled === true,
      confirmation_flow_id: text(sms.confirmation_flow_id),
      dispatch_flow_id: text(sms.dispatch_flow_id),
    },
    whatsapp: {
      enabled: wa.enabled === true,
      integrated_number: text(wa.integrated_number),
      language: text(wa.language, "en") || "en",
      confirmation_template: text(wa.confirmation_template),
      dispatch_template: text(wa.dispatch_template),
    },
  };
}

/** What gets stored: trimmed, empty ids as null. */
export function serializeOrderNotificationSettings(s: OrderNotificationSettings) {
  const id = (v: string) => v.trim() || null;
  return {
    mode: s.mode,
    sms: { enabled: s.sms.enabled, confirmation_flow_id: id(s.sms.confirmation_flow_id), dispatch_flow_id: id(s.sms.dispatch_flow_id) },
    whatsapp: {
      enabled: s.whatsapp.enabled,
      integrated_number: id(s.whatsapp.integrated_number),
      language: s.whatsapp.language.trim() || "en",
      confirmation_template: id(s.whatsapp.confirmation_template),
      dispatch_template: id(s.whatsapp.dispatch_template),
    },
  };
}

export const PARTNER_OPTIONS: { value: PartnerType; label: string }[] = [
  { value: "in_house", label: "In-house" },
  { value: "rapido", label: "Rapido" },
  { value: "porter", label: "Porter" },
  { value: "other", label: "Other" },
];

export const partnerLabel = (type: string | null | undefined, name?: string | null) =>
  type === "other" ? name || "Other" : PARTNER_OPTIONS.find((p) => p.value === type)?.label ?? "—";

/** 10-digit Indian mobile from +91 / 91 / 0 prefixed or spaced input; null otherwise. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Orders that can be dispatched: paid and not cancelled / returned. */
export const canDispatch = (order: { payment_status: string; status: string }) =>
  order.payment_status === "completed" &&
  !["cancelled", "returned", "return_initiated", "return_in_transit"].includes(order.status);

export const EVENT_LABELS: Record<string, string> = {
  order_confirmed: "Order confirmation",
  order_dispatched: "Dispatch",
};

export const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
  unknown: "Unconfirmed",
};

export const MODE_LABELS: Record<NotificationMode, string> = {
  off: "Off",
  record_only: "Record only (test, nothing is sent)",
  live: "Live",
};
