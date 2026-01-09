import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import DeliveryDashboard from "./DeliveryDashboard";

/**
 * Driver Mobile App Entry Point
 * This page serves as the dedicated mobile app experience for delivery drivers.
 * It initializes push notifications and provides a streamlined delivery interface.
 */
export default function DriverApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isSupported } = usePushNotifications();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?redirect=/driver-app");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading Driver App...</p>
        </div>
      </div>
    );
  }

  // Render the delivery dashboard (could be customized for mobile-only view)
  return <DeliveryDashboard />;
}
