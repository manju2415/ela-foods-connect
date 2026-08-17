import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingStatus {
  isLoading: boolean;
  isProfileComplete: boolean;
  isPaymentComplete: boolean;
  isFullyOnboarded: boolean;
  isDeliveryPartner: boolean;
}

export function useOnboardingStatus(userId: string | undefined): OnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus>({
    isLoading: true,
    isProfileComplete: false,
    isPaymentComplete: false,
    isFullyOnboarded: false,
    isDeliveryPartner: false,
  });

  useEffect(() => {
    if (!userId) {
      setStatus({
        isLoading: false,
        isProfileComplete: false,
        isPaymentComplete: false,
        isFullyOnboarded: false,
        isDeliveryPartner: false,
      });
      return;
    }

    checkOnboardingStatus(userId);
  }, [userId]);

  const checkOnboardingStatus = async (uid: string, retryCount = 0) => {
    try {
      // user_roles is the source of truth for onboarding exemptions.
      const [profileRes, roleRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("phone, bank_account_number, registration_fee_paid, user_level")
          .eq("id", uid)
          .single(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid)
      ]);

      const profile = profileRes.data;
      const roles = (roleRes.data || []).map((row) => row.role as string);
      const isDeliveryPartner = roles.includes("delivery_partner");
      const isAdmin = roles.some((role) => ["super_admin", "admin", "mlm_admin"].includes(role));

      // If no admin role, no partner, and no profile yet, retry once
      // (auth session may not have fully propagated to RLS)
      if (!isAdmin && !isDeliveryPartner && !profile && retryCount < 2) {
        await new Promise(r => setTimeout(r, 800));
        return checkOnboardingStatus(uid, retryCount + 1);
      }

      // Delivery partners and admin accounts skip onboarding.
      // Founders and members must complete profile + registration payment.
      if (isDeliveryPartner || isAdmin) {
        setStatus({
          isLoading: false,
          isProfileComplete: true,
          isPaymentComplete: true,
          isFullyOnboarded: true,
          isDeliveryPartner: isDeliveryPartner,
        });
        return;
      }

      if (!profile) {
        setStatus({
          isLoading: false,
          isProfileComplete: false,
          isPaymentComplete: false,
          isFullyOnboarded: false,
          isDeliveryPartner: false,
        });
        return;
      }

      const hasPhone = !!profile.phone;
      const hasBankDetails = !!profile.bank_account_number;
      const isProfileComplete = hasPhone && hasBankDetails;
      const isPaymentComplete = (profile.registration_fee_paid || 0) > 0;

      setStatus({
        isLoading: false,
        isProfileComplete,
        isPaymentComplete,
        isFullyOnboarded: isProfileComplete && isPaymentComplete,
        isDeliveryPartner: false,
      });
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      setStatus({
        isLoading: false,
        isProfileComplete: false,
        isPaymentComplete: false,
        isFullyOnboarded: false,
        isDeliveryPartner: false,
      });
    }
  };

  return status;
}
