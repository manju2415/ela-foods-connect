import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useAppManifest } from "@/hooks/useAppManifest";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PWABadge } from "@/components/pwa/PWABadge";
import Dashboard from "./Dashboard";

/**
 * Member Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for MLM members.
 * It provides access to referral network, wallet, and earnings tracking.
 */
export default function MemberApp() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isSupported, permissionStatus, requestPermission } = useFCMPushNotifications();
  const { hideSplash } = useSplashScreen('member');
  const { isLoading: onboardingLoading, isFullyOnboarded, isProfileComplete, isPaymentComplete, isDeliveryPartner } = useOnboardingStatus(user?.id);
  
  // Set up app-specific manifest
  useAppManifest('member');

  const isLoading = authLoading || onboardingLoading;

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/auth?redirect=/member-app");
      return;
    }
  }, [user, authLoading, navigate]);

  // Redirect based on onboarding status (delivery partners skip this)
  useEffect(() => {
    if (isLoading || !user || isDeliveryPartner) return;
    
    if (!isProfileComplete) {
      navigate("/complete-registration", { replace: true });
      return;
    }
    
    if (!isPaymentComplete) {
      navigate("/registration-payment", { replace: true });
      return;
    }
  }, [isLoading, user, isProfileComplete, isPaymentComplete, isDeliveryPartner, navigate]);

  // Request push notification permission after dashboard is fully loaded and functional
  useEffect(() => {
    if (!isLoading && user && isFullyOnboarded && isSupported && permissionStatus === 'prompt') {
      const scheduleRegistration = () => {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => {
            setTimeout(() => requestPermission(), 1000);
          }, { timeout: 5000 });
        } else {
          setTimeout(() => requestPermission(), 3000);
        }
      };
      
      const timer = setTimeout(scheduleRegistration, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, user, isFullyOnboarded, isSupported, permissionStatus, requestPermission]);

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
            <h1 className="text-xl font-bold text-white mb-2">ELA Network</h1>
            <p className="text-white/70">Grow your network</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="member">
      <Dashboard />
      <InstallPrompt appName="ELA Network" appType="member" themeColor="#7c3aed" />
      <PWABadge />
    </MobileAppLayout>
  );
}
