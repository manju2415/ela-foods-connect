// Matches the default `new_arrival_days` in product_display_settings (see
// supabase/migrations/20260904000000_product_display_settings.sql) — that
// table drives the curated homepage "New Arrivals" section and is
// admin-editable; this fixed window is only for the badge shown on the
// Products/Category/Product-detail pages, which don't read that setting.
const NEW_ARRIVAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** A product counts as a "New Arrival" for its first 30 days after creation. */
export function isNewArrival(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs <= NEW_ARRIVAL_WINDOW_MS;
}
