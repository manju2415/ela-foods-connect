import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Store-pickup inventory (`store_inventory`) is a pool kept separate from a
 * product's central `stock_quantity` — see the admin Store Inventory page,
 * where "Global Stock" and "Store Stock" are edited independently. A product
 * can be sold out centrally while a specific store still has plenty, and
 * customers only choose delivery vs. store pickup at checkout, so browsing
 * pages can't show a per-store number. This returns, per product, the
 * largest stock_quantity held by any single store (the most a customer
 * could actually collect from one pickup location) so "Out of Stock" /
 * quantity limits during browsing aren't based on central stock alone.
 * Order placement still re-validates the real per-fulfillment stock
 * server-side in place_order_atomic, so this can't cause overselling.
 */
export function useStorePickupStockMap(productIds: string[]) {
  const key = Array.from(new Set(productIds)).sort().join(",");

  return useQuery({
    queryKey: ["store-pickup-stock", key],
    queryFn: async () => {
      const ids = key ? key.split(",") : [];
      if (ids.length === 0) return new Map<string, number>();

      const { data, error } = await supabase
        .from("store_inventory")
        .select("product_id, stock_quantity")
        .in("product_id", ids)
        .gt("stock_quantity", 0);

      const map = new Map<string, number>();
      if (error || !data) return map;

      for (const row of data) {
        map.set(row.product_id, Math.max(map.get(row.product_id) ?? 0, row.stock_quantity));
      }
      return map;
    },
    enabled: key.length > 0,
    staleTime: 60_000,
  });
}
