// Shared registration completion.
//
// Runs everything that must happen once a registration fee payment is verified:
// marks the fee paid, activates founders, credits the welcome bonus, records the
// wallet entry + notification, runs the MLM referral payouts and grants the
// member role.
//
// It is called from two places so it can never be skipped:
//  - razorpay-verify-payment (server-side, right after the payment is verified)
//  - process-registration-payment (client-side callback, web + native app)
//
// Safe to run repeatedly: every step is guarded so nothing is credited twice.

// deno-lint-ignore-file no-explicit-any
type Client = any;

const WELCOME_BONUS_DESCRIPTION = "Registration welcome bonus";

export interface CompleteRegistrationResult {
  success: boolean;
  already_paid?: boolean;
  wallet_credit?: number;
  registration_amount?: number;
  error?: string;
}

export async function completeRegistration(
  supabase: Client,
  userId: string,
  paymentId: string | null,
  capturedAmount: number | null,
  referralCode?: string | null,
): Promise<CompleteRegistrationResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("registration_fee_paid, user_level, is_designated_founder, founder_status, mlm_settings_version_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return { success: false, error: "Profile not found" };
  }

  const { data: founderRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "founding_member")
    .maybeSingle();

  const isFounder =
    profile.user_level === "founder" || profile.is_designated_founder === true || !!founderRole;

  const { data: settingsData } = await supabase
    .from("mlm_settings")
    .select("value")
    .eq("key", isFounder ? "founder_registration_fee" : "registration_fee")
    .maybeSingle();

  const settingsValue = settingsData?.value as
    | { total?: number; amount?: number; wallet_credit?: number }
    | null;
  const registrationAmount = settingsValue?.total || settingsValue?.amount || (isFounder ? 4999 : 2499);
  const walletCredit = settingsValue?.wallet_credit || (isFounder ? 3001 : 1000);

  // Never accept a payment smaller than the real fee for this account type.
  if (capturedAmount !== null && capturedAmount < registrationAmount) {
    console.error("Registration underpayment detected:", { userId, capturedAmount, registrationAmount });
    return { success: false, error: "Paid amount does not match the registration fee" };
  }

  const alreadyPaid = Number(profile.registration_fee_paid || 0) > 0;

  // Founders must be approved by a Super Admin before paying.
  if (
    !alreadyPaid &&
    isFounder &&
    profile.founder_status !== "approved_pending_payment" &&
    profile.founder_status !== "active"
  ) {
    return { success: false, error: "Your founding member application is pending Super Admin approval." };
  }

  if (alreadyPaid) {
    // Self-heal founder status, then fall through to the wallet/referral steps
    // below, which are individually guarded — this is how a half-finished
    // registration (fee recorded manually, bonus missing) gets repaired.
    if (isFounder && (profile.founder_status !== "active" || profile.user_level !== "founder")) {
      await supabase
        .from("profiles")
        .update({ founder_status: "active", user_level: "founder", is_designated_founder: true })
        .eq("id", userId);
    }
  } else {
    let versionId: string | null = profile.mlm_settings_version_id ?? null;
    if (!versionId) {
      const { data: latestVersion } = await supabase
        .from("mlm_settings_versions")
        .select("id")
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      versionId = latestVersion?.id ?? null;
    }

    const profileUpdate: Record<string, unknown> = { registration_fee_paid: registrationAmount };
    if (versionId) profileUpdate.mlm_settings_version_id = versionId;
    if (isFounder) {
      profileUpdate.founder_status = "active";
      profileUpdate.user_level = "founder";
      profileUpdate.is_designated_founder = true;
    }

    const { error: profileError } = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
    if (profileError) {
      console.error("Profile update error:", profileError);
      return { success: false, error: "Failed to update profile" };
    }

    if (isFounder) {
      const { data: existingLog } = await supabase
        .from("founder_payment_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("payment_id", paymentId ?? "")
        .maybeSingle();

      if (!existingLog) {
        const { error: logError } = await supabase.from("founder_payment_logs").insert({
          user_id: userId,
          amount: registrationAmount,
          payment_id: paymentId,
          status: "success",
          notes: "Founding member registration fee",
        });
        if (logError) console.error("Founder payment log error:", logError);
      }
    }
  }

  // --- Welcome bonus (guarded so it can never be credited twice) ---
  const { data: walletId } = await supabase.rpc("ensure_user_wallet", { p_user_id: userId });

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance, purchase_only_balance")
    .eq("user_id", userId)
    .maybeSingle();

  const resolvedWalletId = wallet?.id ?? walletId ?? null;

  if (resolvedWalletId) {
    const { data: existingBonus } = await supabase
      .from("wallet_transactions")
      .select("id")
      .eq("wallet_id", resolvedWalletId)
      .eq("description", WELCOME_BONUS_DESCRIPTION)
      .maybeSingle();

    if (!existingBonus) {
      const newBalance = Number(wallet?.balance || 0) + walletCredit;

      const { error: txnError } = await supabase.from("wallet_transactions").insert({
        wallet_id: resolvedWalletId,
        type: "credit",
        amount: walletCredit,
        balance_after: newBalance,
        description: WELCOME_BONUS_DESCRIPTION,
        is_withdrawable: false,
      });

      if (txnError) {
        console.error("Welcome bonus transaction error:", txnError);
      } else {
        const { error: walletError } = await supabase
          .from("wallets")
          .update({
            balance: newBalance,
            purchase_only_balance: Number(wallet?.purchase_only_balance || 0) + walletCredit,
          })
          .eq("id", resolvedWalletId);
        if (walletError) console.error("Wallet update error:", walletError);

        await supabase.from("notifications").insert({
          user_id: userId,
          title: "Registration Complete!",
          message: `Welcome to Ela Bazar! ₹${walletCredit} has been credited to your wallet.`,
          type: "success",
        });
      }
    }
  }

  // --- Referral payouts (process_mlm_referral is itself idempotent per user) ---
  const { data: referralAlreadyDone } = await supabase
    .from("referrals")
    .select("id")
    .eq("referred_id", userId)
    .maybeSingle();

  if (!referralAlreadyDone) {
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", userId)
      .maybeSingle();

    let referralCodeToUse: string | null = null;

    if (userProfile?.referred_by) {
      const { data: referralData } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", userProfile.referred_by)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      referralCodeToUse = referralData?.code ?? null;
    } else if (typeof referralCode === "string" && referralCode.trim().length >= 3) {
      const { data: enteredCode } = await supabase
        .from("referral_codes")
        .select("code, user_id")
        .eq("code", referralCode.trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      if (enteredCode && enteredCode.user_id !== userId) {
        referralCodeToUse = enteredCode.code;
      }
    }

    // Walk-in registration: place the member randomly under a founder.
    if (!referralCodeToUse && !isFounder) {
      const { data: founderRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "founding_member");
      const founderIds = (founderRoles || [])
        .map((role: { user_id: string }) => role.user_id)
        .filter((id: string) => id !== userId);
      if (founderIds.length > 0) {
        const randomBytes = new Uint32Array(1);
        crypto.getRandomValues(randomBytes);
        const founderId = founderIds[randomBytes[0] % founderIds.length];
        let { data: founderCode } = await supabase
          .from("referral_codes")
          .select("code")
          .eq("user_id", founderId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (!founderCode) {
          await supabase.rpc("generate_user_referral_code", { p_user_id: founderId });
          const result = await supabase
            .from("referral_codes")
            .select("code")
            .eq("user_id", founderId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          founderCode = result.data;
        }
        referralCodeToUse = founderCode?.code ?? null;
      }
    }

    if (referralCodeToUse) {
      const { error: mlmError } = await supabase.rpc("process_mlm_referral", {
        p_referral_code: referralCodeToUse,
        p_referred_user_id: userId,
        p_registration_fee: registrationAmount,
      });
      if (mlmError) console.error("MLM referral processing error:", mlmError);
    } else {
      const { error: codeError } = await supabase.rpc("generate_user_referral_code", { p_user_id: userId });
      if (codeError) console.error("Referral code generation error:", codeError);
    }
  }

  await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: "member" }, { onConflict: "user_id,role" });

  return {
    success: true,
    already_paid: alreadyPaid,
    wallet_credit: walletCredit,
    registration_amount: registrationAmount,
  };
}
