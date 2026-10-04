import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchRegistrationEnabled } from "@/hooks/useRegistrationEnabled";

/** Routes where we never interrupt the user with an onboarding redirect. */
const EXEMPT_PREFIXES = [
  "/auth",
  "/signup",
  "/founder-signup",
  "/mlm-login",
  "/complete-registration",
  "/registration-payment",
  "/policies",
  "/terms-and-conditions",
  "/user-agreement",
  "/account-deletion",
  "/delete-account",
  "/admin",
  "/mlm-admin",
  "/delivery",
  "/driver-app",
];

/**
 * Global gate: members and founding members must finish their profile and
 * registration payment before using the rest of the app, no matter how they
 * entered (deep link, restored session, PWA, etc.).
 */
export default function OnboardingGate() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (EXEMPT_PREFIXES.some((p) => location.pathname.startsWith(p))) return;
    if (checkedFor === user.id + location.pathname) return;

    let cancelled = false;

    (async () => {
      const [roleRes, profileRes, registrationEnabled] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("phone, accepted_agreement_at, registration_fee_paid")
          .eq("id", user.id)
          .maybeSingle(),
        fetchRegistrationEnabled(),
      ]);

      if (cancelled) return;
      setCheckedFor(user.id + location.pathname);

      const roles = (roleRes.data || []).map((r) => r.role as string);
      const isAdminish = roles.some((r) =>
        ["super_admin", "admin", "mlm_admin", "delivery_partner"].includes(r)
      );
      const isMemberish = roles.some((r) => ["member", "founding_member"].includes(r));

      if (isAdminish || !isMemberish) return;
      // Registration switched off by super admin: nobody is sent to the
      // details form or the registration fee.
      if (!registrationEnabled) return;

      const profile = profileRes.data;
      if (!profile) return;

      const profileComplete = !!profile.phone && !!profile.accepted_agreement_at;
      const paymentComplete = (profile.registration_fee_paid || 0) > 0;

      let skippedPayment = false;
      try {
        skippedPayment = sessionStorage.getItem("skip_registration_payment") === "1";
      } catch {
        /* ignore storage errors */
      }

      if (!profileComplete) {
        navigate("/complete-registration", { replace: true });
      } else if (!paymentComplete && !skippedPayment) {
        navigate("/registration-payment", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, location.pathname, navigate, checkedFor]);

  return null;
}
