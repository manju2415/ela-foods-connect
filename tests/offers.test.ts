// Offers admin helpers: IST times, status, validation, payload.
// Run: npx -y deno test --allow-read tests/
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  emptyOfferForm,
  formatIst,
  istInputToIso,
  isoToIstInput,
  istTodayAt,
  limitsSummary,
  offerStatus,
  percentOff,
  priceWarning,
  toSavePayload,
  validateOfferForm,
  type OfferForm,
} from "../src/lib/offers.ts";

Deno.test("IST input <-> ISO round trip, independent of device time zone", () => {
  assertEquals(istInputToIso("2026-11-03T15:30"), "2026-11-03T10:00:00.000Z");
  assertEquals(istInputToIso("2026-11-04T00:15"), "2026-11-03T18:45:00.000Z");
  assertEquals(isoToIstInput("2026-11-03T10:00:00.000Z"), "2026-11-03T15:30");
  assertEquals(isoToIstInput("2026-11-03T18:45:00+00:00"), "2026-11-04T00:15");
  assertEquals(istInputToIso("2026-11-03"), null);
  assertEquals(istInputToIso(""), null);
  assertEquals(istInputToIso("2026-13-45T99:99"), null);
});

Deno.test("istTodayAt uses the IST calendar day", () => {
  // 20:00 UTC on 3 Nov is already 4 Nov in India.
  assertEquals(istTodayAt(23, 59, new Date("2026-11-03T20:00:00Z")), "2026-11-04T23:59");
  assertEquals(istTodayAt(9, 5, new Date("2026-11-03T05:00:00Z")), "2026-11-03T09:05");
});

Deno.test("formatIst shows India time", () => {
  const s = formatIst("2026-11-03T10:00:00Z");
  assert(s.includes("3") && s.includes("Nov") && s.includes("3:30"), s);
});

Deno.test("status: off, scheduled, live, ended, open-ended", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  const base = { starts_at: "2026-11-03T09:00:00Z", ends_at: "2026-11-03T11:00:00Z" };
  assertEquals(offerStatus({ ...base, is_active: false }, now), "off");
  assertEquals(offerStatus({ ...base, is_active: true }, now), "live");
  assertEquals(offerStatus({ ...base, is_active: true, starts_at: "2026-11-03T10:00:01Z" }, now), "scheduled");
  assertEquals(offerStatus({ ...base, is_active: true, ends_at: "2026-11-03T10:00:00Z" }, now), "ended");
  assertEquals(offerStatus({ ...base, is_active: true, ends_at: null }, now), "live");
  // an ended offer that is switched off still shows Off
  assertEquals(offerStatus({ ...base, is_active: false, ends_at: "2026-11-01T00:00:00Z" }, now), "off");
});

const item = (offer_price: string) => ({
  product_id: "p1", variant_id: null, name: "Salt", variant_label: null,
  price: 30, member_price: 28, offer_price, product_active: true,
});

Deno.test("defaults: everything off; ₹9 = 1 per order, 1 per customer per day, ₹250 minimum", () => {
  const now = new Date("2026-11-03T10:07:00Z");
  const f = emptyOfferForm("cart_unlock", now);
  assertFalse(f.is_active);
  assertEquals([f.min_cart_value, f.max_units_per_order, f.max_units_per_customer, f.customer_limit_period], ["250", "1", "1", "day"]);
  assertEquals(f.starts_at, "2026-11-03T15:45"); // next quarter hour, IST
  assertEquals(f.ends_at, "");
  const d = emptyOfferForm("deal_of_day", now);
  assertEquals(d.ends_at, "2026-11-03T23:59");
  assertEquals(d.min_cart_value, "");
  assertFalse(emptyOfferForm("festival", now).is_active);
});

Deno.test("validation", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  const ok: OfferForm = { ...emptyOfferForm("cart_unlock", now), name: "Spend 250", items: [item("9")] };
  assertEquals(validateOfferForm(ok), {});

  assert(validateOfferForm({ ...ok, name: " " }).name);
  assert(validateOfferForm({ ...ok, min_cart_value: "0" }).min_cart_value);
  assert(validateOfferForm({ ...ok, min_cart_value: "abc" }).min_cart_value);
  assert(validateOfferForm({ ...ok, max_units_per_order: "0" }).max_units_per_order);
  assert(validateOfferForm({ ...ok, max_units_per_order: "1.5" }).max_units_per_order);
  assert(validateOfferForm({ ...ok, max_units_per_customer: "-1" }).max_units_per_customer);
  assertEquals(validateOfferForm({ ...ok, max_units_per_customer: "" }).max_units_per_customer, undefined);
  assert(validateOfferForm({ ...ok, ends_at: "2026-11-03T15:00" }).ends_at); // before start
  assert(validateOfferForm({ ...ok, items: [item("0")] }).item_0);
  assert(validateOfferForm({ ...ok, items: [item("9.999")] }).item_0);
  assert(validateOfferForm({ ...ok, is_active: true, items: [] }).items);
  assertEquals(validateOfferForm({ ...ok, is_active: false, items: [] }).items, undefined);

  const fest: OfferForm = { ...emptyOfferForm("festival", now), name: "Diwali", items: [item("25")] };
  assert(validateOfferForm(fest).ends_at); // festival needs an end
  assertEquals(validateOfferForm({ ...fest, ends_at: "2026-11-10T23:59" }), {});
  assertEquals(validateOfferForm({ ...fest, ends_at: "2026-11-10T23:59", min_cart_value: "" }), {});
});

Deno.test("price warnings and % off", () => {
  assertEquals(priceWarning(item("9")), null);
  assert(priceWarning(item("30"))?.includes("regular"));
  assert(priceWarning(item("29"))?.includes("Members"));
  assertEquals(priceWarning(item("")), null);
  assertEquals(percentOff(30, "9"), 70);
  assertEquals(percentOff(30, "30"), null);
  assertEquals(percentOff(0, "9"), null);
});

Deno.test("save payload: IST -> UTC, no min cart for festival, period reset without a customer limit", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  const fest: OfferForm = {
    ...emptyOfferForm("festival", now), name: " Diwali ", starts_at: "2026-11-05T00:00", ends_at: "2026-11-10T23:59",
    min_cart_value: "250", max_units_per_customer: "", customer_limit_period: "day", items: [item("25.50")],
  };
  const p = toSavePayload(fest);
  assertEquals(p.p_offer.name, "Diwali");
  assertEquals(p.p_offer.starts_at, "2026-11-04T18:30:00.000Z");
  assertEquals(p.p_offer.ends_at, "2026-11-10T18:29:00.000Z");
  assertEquals(p.p_offer.min_cart_value, null);
  assertEquals(p.p_offer.customer_limit_period, "offer");
  assertEquals(p.p_items, [{ product_id: "p1", variant_id: null, offer_price: 25.5 }]);
  assertFalse(p.p_offer.is_active);
});

Deno.test("limits summary", () => {
  assertEquals(limitsSummary({ max_units_per_order: 1, max_units_per_customer: 1, customer_limit_period: "day", total_units_cap: 500 }),
    "1 per order · 1 per customer per day · 500 in total");
  assertEquals(limitsSummary({ max_units_per_order: 5, max_units_per_customer: null, customer_limit_period: "offer", total_units_cap: null }), "5 per order");
});
