import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import Index from "./Index";

/**
 * Customer Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for customers.
 * It provides a streamlined shopping and order tracking interface.
 */
export default function CustomerApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isSupported, permissionStatus, requestPermission } = useFCMPushNotifications();

  useEffect(() => {
    // Customer app can work without login (for browsing)
    // Push notifications only work when logged in
  }, [user, loading]);

  // Request push notification permission when user is logged in
  useEffect(() => {
    if (isSupported && permissionStatus === 'prompt' && user) {
      requestPermission();
    }
  }, [isSupported, permissionStatus, user, requestPermission]);

  if (loading) {
    return (
      <MobileAppLayout appType="customer" hideNav>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading ELA Foods...</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="customer">
      <Index />
    </MobileAppLayout>
  );
}
