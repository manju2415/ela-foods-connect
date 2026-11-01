import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Express Delivery (shipping_settings.express). Off unless an admin enables it;
// eligibility itself is decided on the server (express_delivery_quote).
export interface ExpressSettings {
  enabled: boolean;
  radius_km: number;
  fee: number;
  eta_minutes: number;
  last_order_time: string; // "HH:MM" IST, "" for no cutoff
}

export const defaultExpressSettings: ExpressSettings = {
  enabled: false,
  radius_km: 10,
  fee: 49,
  eta_minutes: 120,
  last_order_time: "16:00",
};

export interface ShippingSettings {
  free_shipping_threshold: number;
  flat_rate: number;
  enable_free_shipping: boolean;
  express?: Partial<ExpressSettings>;
}

const defaultShippingSettings: ShippingSettings = {
  free_shipping_threshold: 500,
  flat_rate: 50,
  enable_free_shipping: true,
};

export function useShippingSettings() {
  const { data: shippingSettings = defaultShippingSettings, isLoading } = useQuery({
    queryKey: ["platform-settings", "shipping_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "shipping_settings")
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        return { ...defaultShippingSettings, ...(data.value as unknown as ShippingSettings) };
      }
      return defaultShippingSettings;
    },
    staleTime: 5 * 60 * 1000,
  });

  const expressSettings: ExpressSettings = { ...defaultExpressSettings, ...shippingSettings.express };

  // Same rule as place_order_atomic: Express adds its fee to the standard charge.
  const calculateShipping = (subtotal: number, fulfillmentType: string = "delivery", express = false): number => {
    if (fulfillmentType === "store_pickup") return 0;
    const standard =
      shippingSettings.enable_free_shipping && subtotal >= shippingSettings.free_shipping_threshold ? 0 : shippingSettings.flat_rate;
    return express ? standard + expressSettings.fee : standard;
  };

  return { shippingSettings, expressSettings, calculateShipping, isLoading };
}
