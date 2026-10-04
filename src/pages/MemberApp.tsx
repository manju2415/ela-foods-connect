import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useAppManifest } from "@/hooks/useAppManifest";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useRegistrationEnabled } from "@/hooks/useRegistrationEnabled";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

import Dashboard from "./Dashboard";

/**
 * Member Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for MLM members.
 * It provides access to referral network, wallet, and earnings tracking.
 */
export default function MemberApp() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { hideSplash } = useSplashScreen('member');
  const { isLoading: onboardingLoading, isFullyOnboarded, isProfileComplete, isPaymentComplete, isDeliveryPartner } = useOnboardingStatus(user?.id);
  const { registrationEnabled, isLoading: registrationSettingLoading } = useRegistrationEnabled();
  
  // Set up app-specific manifest
  useAppManifest('member');

  const isLoading = authLoading || onboardingLoading || registrationSettingLoading;

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/auth?redirect=/member-app");
      return;
    }
  }, [user, authLoading, navigate]);

  // Redirect based on onboarding status (delivery partners and fully onboarded users skip this)
  useEffect(() => {
    if (isLoading || !user || isDeliveryPartner || isFullyOnboarded) return;

    // Registration switched off by super admin: an account that never
    // finished registering shops in the customer app instead.
    if (!registrationEnabled) {
      navigate("/customer-app", { replace: true });
      return;
    }

    if (!isProfileComplete) {
      navigate("/complete-registration", { replace: true });
      return;
    }
    
    if (!isPaymentComplete) {
      navigate("/registration-payment", { replace: true });
      return;
    }
  }, [isLoading, user, isProfileComplete, isPaymentComplete, isDeliveryPartner, isFullyOnboarded, navigate, registrationEnabled]);

  // Hide splash screen when app is ready
  useEffect(() => {
    if (!isLoading) {
      hideSplash();
    }
  }, [isLoading, hideSplash]);

  if (isLoading || !isFullyOnboarded) {
    return (
      <MobileAppLayout appType="member" hideNav>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#7c3aed' }}>
          <div className="text-center">
            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🌐</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Ela Bazar Network</h1>
            <p className="text-white/70">Grow your network</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="member">
      <Dashboard hideChrome />
      <InstallPrompt appName="Ela Bazar Network" appType="member" themeColor="#7c3aed" />
    </MobileAppLayout>
  );
}
