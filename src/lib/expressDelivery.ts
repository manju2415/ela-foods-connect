import { untypedSupabase } from "@/lib/untypedSupabase";

// Express Delivery eligibility comes from the server (express_delivery_quote):
// Haversine distance from the nearest active store, the store's hours, the
// configured cutoff and today's delivery calendar. place_order_atomic runs the
// same check again when the order is quoted or placed.

export interface ExpressQuote {
  eligible: boolean;
  code?: "DISABLED" | "NO_LOCATION" | "NO_STORE" | "OUT_OF_RANGE" | "CLOSED" | "NOT_TODAY" | "UNAVAILABLE";
  reason?: string;
  store_name?: string;
  distance_km?: number;
  fee?: number;
  eta_minutes?: number;
  delivery_date?: string; // yyyy-MM-dd, IST
  available_until?: string | null; // HH:MM, IST
}

// Codes for which the option is not shown at all (nothing the customer can do).
export const HIDDEN_EXPRESS_CODES: ExpressQuote["code"][] = ["DISABLED", "NO_STORE", "UNAVAILABLE"];

export async function fetchExpressQuote(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  productIds: string[],
): Promise<ExpressQuote> {
  try {
    const { data, error } = await untypedSupabase.rpc("express_delivery_quote", {
      p_latitude: latitude ?? null,
      p_longitude: longitude ?? null,
      p_product_ids: productIds,
    });
    // Not deployed yet, or any other failure: behave as if Express is off.
    if (error || !data) return { eligible: false, code: "UNAVAILABLE" };
    return data as ExpressQuote;
  } catch {
    return { eligible: false, code: "UNAVAILABLE" };
  }
}

export const etaLabel = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;

// "16:00" -> "4:00 PM"
export const clockLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
