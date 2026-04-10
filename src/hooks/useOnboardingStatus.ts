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

  const checkOnboardingStatus = async (uid: string) => {
    try {
      // Check profile, delivery partner, and dashboard-eligible roles in parallel
      const [profileRes, partnerRes, memberAccessRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("phone, bank_account_number, registration_fee_paid, user_level")
          .eq("id", uid)
          .single(),
        supabase
          .from("delivery_partners")
          .select("id")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid)
          .in("role", ["founding_member", "super_admin", "admin", "member", "mlm_admin"])
          .limit(1)
          .maybeSingle(),
      ]);

      const profile = profileRes.data;
      const isDeliveryPartner = !!partnerRes.data;
      const hasMemberDashboardAccess = !!memberAccessRes.data || profile?.user_level === "founder";

      // Delivery partners and member/admin accounts skip onboarding when entering the member dashboard
      if (isDeliveryPartner || hasMemberDashboardAccess) {
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
