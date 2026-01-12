import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import Dashboard from "./Dashboard";

/**
 * Member Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for MLM members.
 * It provides access to referral network, wallet, and earnings tracking.
 */
export default function MemberApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isSupported, permissionStatus, requestPermission } = useFCMPushNotifications();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?redirect=/member-app");
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
      <MobileAppLayout appType="member" hideNav>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading Member Portal...</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="member">
      <Dashboard />
    </MobileAppLayout>
  );
}
