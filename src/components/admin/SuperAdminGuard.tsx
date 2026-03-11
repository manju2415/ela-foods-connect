import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SuperAdminGuardProps {
  children: ReactNode;
}

export function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  // MLM admin routes only require admin role, not super_admin
  const isMLMRoute = location.pathname.startsWith("/mlm-admin");

  useEffect(() => {
    const checkStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      if (isMLMRoute) {
        const { data } = await supabase.rpc("is_admin", { _user_id: user.id });
        setIsAuthorized(!!data);
      } else {
        const { data } = await supabase.rpc("is_super_admin", { _user_id: user.id });
        setIsAuthorized(!!data);
      }
      setChecking(false);
    };

    if (!authLoading) {
      checkStatus();
    }
  }, [user, authLoading, isMLMRoute]);

  useEffect(() => {
    if (!authLoading && !checking) {
      if (!user) {
        navigate(isMLMRoute ? "/mlm-login" : "/auth");
      } else if (isAuthorized === false) {
        toast.error(isMLMRoute ? "Access denied. Admin privileges required." : "Access denied. Super Admin privileges required.");
        navigate(isMLMRoute ? "/mlm-admin" : "/admin");
      }
    }
  }, [user, isAuthorized, authLoading, checking, navigate, isMLMRoute]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
