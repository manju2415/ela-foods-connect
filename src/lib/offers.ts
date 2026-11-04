// Offers & Promotions (Stage A: admin only). Labels, IST date handling,
// status and form validation for /admin/offers. The database re-checks every
// rule (20261103200000_offers_stage_a.sql); these only drive the form.

export type OfferKind = "cart_unlock" | "festival" | "deal_of_day";
export type OfferStatus = "off" | "scheduled" | "live" | "ended";
export type OfferAudience = "all" | "members" | "non_members";
export type LimitPeriod = "offer" | "day";

export interface OfferRow {
  id: string;
  kind: OfferKind;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  min_cart_value: number | null;
  max_units_per_order: number;
  max_units_per_customer: number | null;
  customer_limit_period: LimitPeriod;
  total_units_cap: number | null;
  audience: OfferAudience;
  updated_at: string;
}

export interface OfferItemRow {
  id: string;
  offer_id: string;
  product_id: string;
  variant_id: string | null;
  offer_price: number;
  is_active: boolean;
  display_order: number;
}

export const KIND_CONFIG: Record<OfferKind, {
  tab: string;
  title: string;
  help: string;
  endRequired: boolean;
  usesMinCart: boolean;
  newLabel: string;
}> = {
  cart_unlock: {
    tab: "₹9 Offers",
    title: "₹9 Offers",
    help: "Customers can buy selected products at a special price once their cart reaches a minimum amount.",
    endRequired: false,
    usesMinCart: true,
    newLabel: "New ₹9 offer",
  },
  festival: {
    tab: "Festival Offers",
    title: "Festival Offers",
    help: "Special prices on selected products for a festival or occasion, between two dates.",
    endRequired: true,
    usesMinCart: false,
    newLabel: "New festival offer",
  },
  deal_of_day: {
    tab: "Deal of the Day",
    title: "Deal of the Day",
    help: "Short deals shown on the homepage. They disappear automatically when they end.",
    endRequired: true,
    usesMinCart: false,
    newLabel: "New deal",
  },
};

export const OFFER_KINDS: OfferKind[] = ["cart_unlock", "festival", "deal_of_day"];

export const STATUS_LABELS: Record<OfferStatus, string> = {
  off: "Off",
  scheduled: "Scheduled",
  live: "Live",
  ended: "Ended",
};

export const AUDIENCE_LABELS: Record<OfferAudience, string> = {
  all: "Everyone",
  members: "Members only",
  non_members: "Non-members only",
};

/** Off unless switched on; then by the time window. */
export function offerStatus(
  offer: Pick<OfferRow, "is_active" | "starts_at" | "ends_at">,
  now: Date = new Date(),
): OfferStatus {
  if (!offer.is_active) return "off";
  const t = now.getTime();
  if (t < new Date(offer.starts_at).getTime()) return "scheduled";
  if (offer.ends_at && t >= new Date(offer.ends_at).getTime()) return "ended";
  return "live";
}

// ---------------------------------------------------------------------------
// India time. Admins type times in IST whatever their device's time zone.
// ---------------------------------------------------------------------------
const IST_OFFSET_MS = 330 * 60 * 1000;

/** "2026-11-03T15:30" typed as IST -> ISO string (UTC). Null if malformed. */
export function istInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO string -> "YYYY-MM-DDTHH:mm" in IST for a datetime-local input. */
export function isoToIstInput(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** Today at hh:mm IST as an input value. */
export function istTodayAt(hours: number, minutes: number, now: Date = new Date()): string {
  const day = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return `${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const istFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "3 Nov 2026, 3:30 pm" in IST. */
export function formatIst(iso: string): string {
  return istFormat.format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
export interface OfferFormItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_label: string | null;
  price: number;
  member_price: number | null;
  offer_price: string;
  product_active: boolean;
}

export interface OfferForm {
  id: string | null;
  kind: OfferKind;
  name: string;
  description: string;
  starts_at: string; // IST input value
  ends_at: string; // IST input value or ""
  is_active: boolean;
  min_cart_value: string;
  max_units_per_order: string;
  max_units_per_customer: string;
  customer_limit_period: LimitPeriod;
  total_units_cap: string;
  audience: OfferAudience;
  items: OfferFormItem[];
}

/** Defaults per kind (approved: ₹9 = 1 per order, 1 per customer per day). */
export function emptyOfferForm(kind: OfferKind, now: Date = new Date()): OfferForm {
  const start = isoToIstInput(new Date(Math.ceil(now.getTime() / 900000) * 900000).toISOString());
  return {
    id: null,
    kind,
    name: "",
    description: "",
    starts_at: start,
    ends_at: kind === "deal_of_day" ? istTodayAt(23, 59, now) : "",
    is_active: false,
    min_cart_value: kind === "cart_unlock" ? "250" : "",
    max_units_per_order: kind === "cart_unlock" ? "1" : "5",
    max_units_per_customer: kind === "cart_unlock" ? "1" : "",
    customer_limit_period: kind === "cart_unlock" ? "day" : "offer",
    total_units_cap: "",
    audience: "all",
    items: [],
  };
}

const wholeNumber = (v: string) => /^\d+$/.test(v.trim());
const money = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

/** Field errors (empty object = valid). */
export function validateOfferForm(form: OfferForm): Record<string, string> {
  const e: Record<string, string> = {};
  const cfg = KIND_CONFIG[form.kind];
  if (!form.name.trim()) e.name = "Give the offer a name";
  else if (form.name.trim().length > 80) e.name = "Keep the name under 80 characters";
  if (form.description.length > 300) e.description = "Keep the description under 300 characters";

  const start = istInputToIso(form.starts_at);
  const end = form.ends_at ? istInputToIso(form.ends_at) : null;
  if (!start) e.starts_at = "Choose when the offer starts";
  if (form.ends_at && !end) e.ends_at = "Choose a valid end time";
  else if (cfg.endRequired && !end) e.ends_at = "Choose when the offer ends";
  else if (start && end && new Date(end) <= new Date(start)) e.ends_at = "The end must be after the start";

  if (cfg.usesMinCart) {
    if (!money(form.min_cart_value) || Number(form.min_cart_value) <= 0) e.min_cart_value = "Enter the minimum cart amount in ₹";
  }
  if (!wholeNumber(form.max_units_per_order) || Number(form.max_units_per_order) < 1 || Number(form.max_units_per_order) > 100) {
    e.max_units_per_order = "Enter a number from 1 to 100";
  }
  if (form.max_units_per_customer.trim() && (!wholeNumber(form.max_units_per_customer) || Number(form.max_units_per_customer) < 1)) {
    e.max_units_per_customer = "Enter a whole number, or leave empty for no limit";
  }
  if (form.total_units_cap.trim() && (!wholeNumber(form.total_units_cap) || Number(form.total_units_cap) < 1)) {
    e.total_units_cap = "Enter a whole number, or leave empty for no limit";
  }

  if (form.is_active && form.items.length === 0) e.items = "Add at least one product before switching the offer on";
  form.items.forEach((it, i) => {
    if (!money(it.offer_price) || Number(it.offer_price) <= 0) e[`item_${i}`] = "Enter a price above ₹0";
  });
  return e;
}

/** Warning (not an error) when the offer price doesn't beat what the customer already pays. */
export function priceWarning(item: Pick<OfferFormItem, "price" | "member_price" | "offer_price">): string | null {
  const p = Number(item.offer_price);
  if (!item.offer_price || !Number.isFinite(p) || p <= 0) return null;
  if (p >= item.price) return `Not lower than the regular price (₹${item.price})`;
  if (item.member_price != null && p >= item.member_price) {
    return `Members already pay ₹${item.member_price}; they won't see a lower price`;
  }
  return null;
}

/** Whole-number % off the regular price, or null. */
export function percentOff(regular: number, offer: string): number | null {
  const p = Number(offer);
  if (!(regular > 0) || !Number.isFinite(p) || p <= 0 || p >= regular) return null;
  return Math.round(((regular - p) / regular) * 100);
}

const intOrNull = (v: string) => (v.trim() ? Number(v.trim()) : null);

/** Arguments for admin_save_offer. Call only after validateOfferForm passes. */
export function toSavePayload(form: OfferForm) {
  const cfg = KIND_CONFIG[form.kind];
  return {
    p_offer: {
      id: form.id,
      kind: form.kind,
      name: form.name.trim(),
      description: form.description.trim() || null,
      starts_at: istInputToIso(form.starts_at),
      ends_at: form.ends_at ? istInputToIso(form.ends_at) : null,
      is_active: form.is_active,
      min_cart_value: cfg.usesMinCart ? Number(form.min_cart_value) : null,
      max_units_per_order: Number(form.max_units_per_order),
      max_units_per_customer: intOrNull(form.max_units_per_customer),
      customer_limit_period: form.max_units_per_customer.trim() ? form.customer_limit_period : "offer",
      total_units_cap: intOrNull(form.total_units_cap),
      audience: form.audience,
    },
    p_items: form.items.map((it) => ({
      product_id: it.product_id,
      variant_id: it.variant_id,
      offer_price: Number(it.offer_price),
    })),
  };
}

/** Short limits summary for the list, e.g. "1 per order · 1 per customer per day". */
export function limitsSummary(o: Pick<OfferRow, "max_units_per_order" | "max_units_per_customer" | "customer_limit_period" | "total_units_cap">): string {
  const parts = [`${o.max_units_per_order} per order`];
  if (o.max_units_per_customer) {
    parts.push(`${o.max_units_per_customer} per customer${o.customer_limit_period === "day" ? " per day" : ""}`);
  }
  if (o.total_units_cap) parts.push(`${o.total_units_cap} in total`);
  return parts.join(" · ");
}
