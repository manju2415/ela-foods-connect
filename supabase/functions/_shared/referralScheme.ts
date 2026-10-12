// deno-lint-ignore-file no-explicit-any
type Client = any;

/**
 * Super-admin referral scheme switch (platform_settings.referral_scheme_settings).
 * True for the simple scheme: flat bonuses on an invited member's first paid
 * order, paid only for real invites (a referrals row). Walk-ins earn nothing
 * and are not placed under a founder. Fails to false (MLM behaviour).
 */
export async function isSimpleReferralScheme(supabase: Client): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("simple_referral_scheme_active");
    if (error) {
      console.error("[referralScheme] lookup failed:", error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[referralScheme] lookup failed:", e);
    return false;
  }
}

/**
 * Simple scheme: record a pending invite so the member's first paid order pays
 * the referral and welcome bonuses. Never overwrites an existing invite.
 */
export async function recordPendingInvite(
  supabase: Client,
  referrerId: string,
  referredId: string,
  referralCodeId: string,
): Promise<void> {
  const { error } = await supabase.from("referrals").upsert(
    {
      referrer_id: referrerId,
      referred_id: referredId,
      referral_code_id: referralCodeId,
      incentive_amount: 0,
      incentive_paid: false,
    },
    { onConflict: "referred_id", ignoreDuplicates: true },
  );
  if (error) console.error("[referralScheme] recording invite failed:", error);
}
