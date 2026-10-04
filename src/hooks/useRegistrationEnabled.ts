import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Super-admin registration switch (platform_settings.registration_settings).
 *
 * ON:  Login → OTP → details + address → registration fee → shop.
 * OFF: Login → OTP → shop; the delivery address is taken at checkout.
 *
 * Fails open — only an explicit `registration_enabled: false` turns it off, so
 * a missing row or a network error keeps today's registration flow. The server
 * enforces the same switch, so this only decides which screens to show.
 */
export const fetchRegistrationEnabled = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "registration_settings")
      .maybeSingle();
    if (error) return true;
    return (data?.value as { registration_enabled?: unknown } | null)?.registration_enabled !== false;
  } catch {
    return true;
  }
};

export const REGISTRATION_ENABLED_QUERY_KEY = ["registration-enabled"];

export function useRegistrationEnabled() {
  const { data, isLoading } = useQuery({
    queryKey: REGISTRATION_ENABLED_QUERY_KEY,
    queryFn: fetchRegistrationEnabled,
    staleTime: 60_000,
  });
  return { registrationEnabled: data ?? true, isLoading };
}
