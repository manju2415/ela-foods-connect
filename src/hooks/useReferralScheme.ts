import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Super-admin referral scheme + withdrawals switches (platform_settings
 * referral_scheme_settings / withdrawal_settings).
 *
 * simple: no MLM payouts; on an invitee's first paid order the inviter gets
 *         referrerBonus and the invitee gets welcomeBonus (purchase-only).
 * mlm:    the full MLM scheme from MLM Settings.
 *
 * Missing rows or a network error mean the MLM scheme with withdrawals on —
 * the same defaults the server uses. The server enforces both switches, so
 * this only decides what to show.
 */
export type ReferralScheme = {
  scheme: "simple" | "mlm";
  referrerBonus: number;
  welcomeBonus: number;
  withdrawalsEnabled: boolean;
};

export const DEFAULT_REFERRAL_SCHEME: ReferralScheme = {
  scheme: "mlm",
  referrerBonus: 99,
  welcomeBonus: 99,
  withdrawalsEnabled: true,
};

export const REFERRAL_SCHEME_QUERY_KEY = ["referral-scheme"];

const toAmount = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const fetchReferralScheme = async (): Promise<ReferralScheme> => {
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["referral_scheme_settings", "withdrawal_settings"]);
    if (error || !data) return DEFAULT_REFERRAL_SCHEME;
    const scheme = data.find((row) => row.key === "referral_scheme_settings")?.value as
      | { scheme?: unknown; referrer_bonus?: unknown; welcome_bonus?: unknown }
      | null
      | undefined;
    const withdrawals = data.find((row) => row.key === "withdrawal_settings")?.value as
      | { withdrawals_enabled?: unknown }
      | null
      | undefined;
    return {
      scheme: scheme?.scheme === "simple" ? "simple" : "mlm",
      referrerBonus: toAmount(scheme?.referrer_bonus, DEFAULT_REFERRAL_SCHEME.referrerBonus),
      welcomeBonus: toAmount(scheme?.welcome_bonus, DEFAULT_REFERRAL_SCHEME.welcomeBonus),
      withdrawalsEnabled: withdrawals?.withdrawals_enabled !== false,
    };
  } catch {
    return DEFAULT_REFERRAL_SCHEME;
  }
};

export function useReferralScheme() {
  const { data, isLoading } = useQuery({
    queryKey: REFERRAL_SCHEME_QUERY_KEY,
    queryFn: fetchReferralScheme,
    staleTime: 60_000,
  });
  return { ...(data ?? DEFAULT_REFERRAL_SCHEME), isLoading };
}
