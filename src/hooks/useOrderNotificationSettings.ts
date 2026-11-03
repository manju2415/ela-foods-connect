import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_NOTIFICATIONS_KEY, parseOrderNotificationSettings } from "@/lib/orderNotifications";

// Under the "platform-settings" prefix, so saving any setting refreshes it.
export const ORDER_NOTIFICATIONS_QUERY_KEY = ["platform-settings", ORDER_NOTIFICATIONS_KEY] as const;

/** Order notification settings; missing or unreadable = everything off. */
export function useOrderNotificationSettings() {
  return useQuery({
    queryKey: ORDER_NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", ORDER_NOTIFICATIONS_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseOrderNotificationSettings(data?.value);
    },
  });
}
