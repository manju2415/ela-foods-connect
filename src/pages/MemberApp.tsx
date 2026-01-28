import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { useSplashScreen } from "@/hooks/useSplashScreen";
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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isSupported, permissionStatus, requestPermission } = useFCMPushNotifications();
  const { hideSplash } = useSplashScreen('member');

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

  // Hide splash screen when app is ready
  useEffect(() => {
    if (!loading) {
      hideSplash();
    }
  }, [loading, hideSplash]);

  if (loading) {
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
