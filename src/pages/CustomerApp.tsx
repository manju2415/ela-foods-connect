import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useAppManifest } from "@/hooks/useAppManifest";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PWABadge } from "@/components/pwa/PWABadge";
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
  const { hideSplash } = useSplashScreen('customer');
  
  // Set up app-specific manifest
  useAppManifest('customer');

  useEffect(() => {
    // Customer app can work without login (for browsing)
    // Push notifications only work when logged in
  }, [user, loading]);

  // Request push notification permission after dashboard is fully loaded and functional
  useEffect(() => {
    if (!loading && user && isSupported && permissionStatus === 'prompt') {
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
  }, [loading, user, isSupported, permissionStatus, requestPermission]);

  // Hide splash screen when app is ready
  useEffect(() => {
    if (!loading) {
      hideSplash();
    }
  }, [loading, hideSplash]);

  if (loading) {
    return (
      <MobileAppLayout appType="customer" hideNav>
        <div className="min-h-screen flex items-center justify-center bg-accent">
          <div className="text-center">
            <div className="w-20 h-20 bg-accent-foreground/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🍽️</span>
            </div>
            <h1 className="text-xl font-bold text-accent-foreground mb-2">ELA Foods</h1>
            <p className="text-accent-foreground/70">Delicious snacks delivered</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="customer">
      <Index hideChrome />
      <InstallPrompt appName="ELA Foods" appType="customer" themeColor="#f97316" />
      <PWABadge />
    </MobileAppLayout>
  );
}
