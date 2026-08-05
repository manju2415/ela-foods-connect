import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useAppManifest } from "@/hooks/useAppManifest";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

import DeliveryDashboard from "./DeliveryDashboard";

/**
 * Driver Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for delivery drivers.
 * It initializes push notifications and provides a streamlined delivery interface.
 */
export default function DriverApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
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

  // NOTE: Push notifications are intentionally disabled for DriverApp right now.
  // We were seeing Android WebView process exits during early PushNotifications initialization,
  // which prevents the dashboard from loading at all.

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
            <h1 className="text-xl font-bold text-white mb-2">Ela Bazar Delivery</h1>
            <p className="text-white/70">Deliver with Ela Bazar</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="driver">
      <OfflineIndicator />
      <DeliveryDashboard hideChrome />
      <InstallPrompt appName="Ela Bazar Delivery" appType="driver" themeColor="#16a34a" />
      <PWABadge />
    </MobileAppLayout>
  );
}
