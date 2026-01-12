import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
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

  if (loading) {
    return (
      <MobileAppLayout appType="driver" hideNav>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading Driver App...</p>
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
