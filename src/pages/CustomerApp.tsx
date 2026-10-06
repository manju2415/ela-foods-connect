import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSplashScreen } from "@/hooks/useSplashScreen";
import { useAppManifest } from "@/hooks/useAppManifest";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { fetchRegistrationEnabled } from "@/hooks/useRegistrationEnabled";
import { Capacitor } from "@capacitor/core";
import { AppHomeTopBar } from "@/components/mobile/AppHomeTopBar";
import { AppPullToRefresh } from "@/components/mobile/AppPullToRefresh";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  
  useAppManifest('customer');

  // Redirect to /auth if not logged in, or to /complete-registration if not registered
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/auth?redirect=/customer-app", { replace: true });
      return;
    }

    const checkRegistration = async () => {
      try {
        // Only member/founder accounts require onboarding. Operational roles bypass it.
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["super_admin", "admin", "mlm_admin", "delivery_partner"])
          .limit(1)
          .maybeSingle();

        if (roleData) {
          return;
        }

        // Registration switched off by super admin: logged-in customers shop
        // straight away; the address is taken at checkout.
        if (!(await fetchRegistrationEnabled())) {
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("phone, accepted_agreement_at, registration_fee_paid")
          .eq("id", user.id)
          .single();

        const isProfileComplete = !!profile?.phone && !!profile?.accepted_agreement_at;
        const isPaymentComplete = (profile?.registration_fee_paid || 0) > 0;

        let skippedPayment = false;
        try {
          skippedPayment = sessionStorage.getItem("skip_registration_payment") === "1";
        } catch {
          /* ignore storage errors */
        }

        if (!isProfileComplete) {
          navigate("/complete-registration", { replace: true });
          return;
        }

        if (isProfileComplete && !isPaymentComplete && !skippedPayment) {
          navigate("/registration-payment", { replace: true });
          return;
        }
      } catch (err) {
        // A network hiccup here must never leave the user stuck on the splash
        // screen forever — fall through and let downstream pages re-check.
        console.error("[CustomerApp] Registration check failed:", err);
      } finally {
        setCheckingRegistration(false);
      }
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
      {Capacitor.isNativePlatform() && <AppHomeTopBar />}
      <AppPullToRefresh onRefresh={() => queryClient.refetchQueries({ type: "active" })}>
        <Index hideChrome />
      </AppPullToRefresh>
      <InstallPrompt appName="Ela Bazar" appType="customer" themeColor="#f97316" />
    </MobileAppLayout>
  );
}
