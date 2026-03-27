import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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

      // Check roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roleSet = new Set((roles || []).map((r) => r.role));

      // Super admin → full admin
      if (roleSet.has("super_admin")) {
        navigate("/admin", { replace: true });
        return;
      }

      // MLM admin → mlm dashboard
      if (roleSet.has("mlm_admin")) {
        navigate("/mlm-admin", { replace: true });
        return;
      }

      // Store admin → products page (no dashboard)
      if (roleSet.has("admin")) {
        navigate("/admin/products", { replace: true });
        return;
      }

      // Founding member or member → member dashboard
      if (roleSet.has("founding_member") || roleSet.has("member")) {
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
