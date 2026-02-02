import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useAppManifest } from "@/hooks/useAppManifest";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PWABadge } from "@/components/pwa/PWABadge";
import DeliveryDashboard from "./DeliveryDashboard";

/**
 * Driver Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for delivery drivers.
 * It initializes push notifications and provides a streamlined delivery interface.
 */
export default function DriverApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isSupported, permissionStatus, requestPermission } = useFCMPushNotifications();
  const { hideSplash } = useSplashScreen('driver');
  const { isOnline } = useOfflineStorage();
  
  // Set up app-specific manifest
  useAppManifest('driver');

  useEffect(() => {
    // Wait for auth to finish loading before making any redirect decision
    if (!loading && !user) {
      // Redirect to auth with the driver-app as the return destination
      navigate("/auth?redirect=/driver-app", { replace: true });
    }
  }, [user, loading, navigate]);

  // Request push notification permission after dashboard is fully loaded and functional
  useEffect(() => {
    if (!loading && user && isSupported && permissionStatus === 'prompt') {
      // Use requestIdleCallback to wait until browser is idle (dashboard fully rendered)
      const scheduleRegistration = () => {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => {
            setTimeout(() => requestPermission(), 1000);
          }, { timeout: 5000 });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(() => requestPermission(), 3000);
        }
      };
      
      const timer = setTimeout(scheduleRegistration, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, user, isSupported, permissionStatus, requestPermission]);

  // Hide splash screen when app is ready
  useEffect(() => {
    if (!loading) {
      hideSplash();
    }
  }, [loading, hideSplash]);

  if (loading) {
    return (
      <MobileAppLayout appType="driver" hideNav>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#16a34a' }}>
          <div className="text-center">
            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🚚</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">ELA Delivery</h1>
            <p className="text-white/70">Deliver with ELA</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="driver">
      <OfflineIndicator />
      <DeliveryDashboard hideChrome />
      <InstallPrompt appName="ELA Delivery" appType="driver" themeColor="#16a34a" />
      <PWABadge />
    </MobileAppLayout>
  );
}
