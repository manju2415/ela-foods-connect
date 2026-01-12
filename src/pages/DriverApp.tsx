import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
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

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?redirect=/driver-app");
    }
  }, [user, loading, navigate]);

  // Request push notification permission on first load
  useEffect(() => {
    if (isSupported && permissionStatus === 'prompt' && user) {
      requestPermission();
    }
  }, [isSupported, permissionStatus, user, requestPermission]);

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
      <DeliveryDashboard />
    </MobileAppLayout>
  );
}
