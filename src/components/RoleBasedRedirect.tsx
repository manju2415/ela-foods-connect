import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Redirects authenticated users to their role-specific dashboard.
 * This is used as the root route handler for the unified Elabazar app.
 */
export default function RoleBasedRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!user) return;

    const resolve = async () => {
      // Check if delivery partner
      const { data: partnerData } = await supabase
        .from("delivery_partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (partnerData) {
        navigate("/driver-app", { replace: true });
        return;
      }

      // Check if admin
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["super_admin", "admin"])
        .limit(1)
        .maybeSingle();
      if (adminRole) {
        navigate("/admin", { replace: true });
        return;
      }

      // Check if founding member or member
      const { data: memberRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["member", "founding_member"])
        .limit(1)
        .maybeSingle();
      if (memberRole) {
        navigate("/dashboard", { replace: true });
        return;
      }

      // Default: customer app
      navigate("/customer-app", { replace: true });
    };

    resolve().finally(() => setResolving(false));
  }, [user, navigate]);

  if (resolving) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}
