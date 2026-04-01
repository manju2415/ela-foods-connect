import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShippingSettings {
  free_shipping_threshold: number;
  flat_rate: number;
  enable_free_shipping: boolean;
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

  const calculateShipping = (subtotal: number, fulfillmentType: string = "delivery"): number => {
    if (fulfillmentType === "store_pickup") return 0;
    if (shippingSettings.enable_free_shipping && subtotal >= shippingSettings.free_shipping_threshold) return 0;
    return shippingSettings.flat_rate;
  };

  return { shippingSettings, calculateShipping, isLoading };
}
