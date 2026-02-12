import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StoreSettings {
  store_name: string;
  store_email: string;
  store_phone: string;
  store_address: string;
  currency: string;
  currency_symbol: string;
}

const defaultStoreSettings: StoreSettings = {
  store_name: "ELA Foods",
  store_email: "contact@elafoods.com",
  store_phone: "",
  store_address: "",
  currency: "INR",
  currency_symbol: "₹",
};

export function useStoreSettings() {
  const { data: storeSettings = defaultStoreSettings, isLoading } = useQuery({
    queryKey: ["platform-settings", "store_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "store_settings")
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        return { ...defaultStoreSettings, ...(data.value as unknown as StoreSettings) };
      }
      return defaultStoreSettings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { storeSettings, isLoading };
}
