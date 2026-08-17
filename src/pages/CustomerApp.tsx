import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useAppManifest } from "@/hooks/useAppManifest";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

import Index from "./Index";

/**
 * Customer Mobile App Entry Point
 * Registration is compulsory after login before accessing the app.
 */
export default function CustomerApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const { hideSplash } = useSplashScreen('customer');
  
  useAppManifest('customer');

  // Redirect to /auth if not logged in, or to /complete-registration if not registered
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/auth?redirect=/customer-app", { replace: true });
      return;
    }

    const checkRegistration = async () => {
      // Only member/founder accounts require onboarding. Operational roles bypass it.
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["super_admin", "admin", "mlm_admin", "delivery_partner"])
        .limit(1)
        .maybeSingle();

      if (roleData) {
        setCheckingRegistration(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("bank_account_number, registration_fee_paid")
        .eq("id", user.id)
        .single();

      const hasBankDetails = !!profile?.bank_account_number;
      const isPaymentComplete = (profile?.registration_fee_paid || 0) > 0;

      let skippedPayment = false;
      try {
        skippedPayment = sessionStorage.getItem("skip_registration_payment") === "1";
      } catch {
        /* ignore storage errors */
      }

      if (!hasBankDetails) {
        navigate("/complete-registration", { replace: true });
        return;
      }

      if (hasBankDetails && !isPaymentComplete && !skippedPayment) {
        navigate("/registration-payment", { replace: true });
        return;
      }

      setCheckingRegistration(false);
    };

    checkRegistration();
  }, [user, loading, navigate]);

  // Hide splash screen when app is ready
  useEffect(() => {
    if (!loading && !checkingRegistration) {
      hideSplash();
    }
  }, [loading, checkingRegistration, hideSplash]);

  if (loading || checkingRegistration) {
    return (
      <MobileAppLayout appType="customer" hideNav>
        <div className="min-h-screen flex items-center justify-center bg-accent">
          <div className="text-center">
            <div className="w-20 h-20 bg-accent-foreground/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🍽️</span>
            </div>
            <h1 className="text-xl font-bold text-accent-foreground mb-2">Ela Bazar</h1>
            <p className="text-accent-foreground/70">Shop quality products</p>
          </div>
        </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="customer">
      <Index hideChrome />
      <InstallPrompt appName="Ela Bazar" appType="customer" themeColor="#f97316" />
    </MobileAppLayout>
  );
}
