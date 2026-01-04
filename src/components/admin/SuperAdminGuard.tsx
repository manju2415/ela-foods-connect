import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkSuperAdminStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      const { data } = await supabase.rpc("is_super_admin", { _user_id: user.id });
      setIsSuperAdmin(!!data);
      setChecking(false);
    };

    if (!authLoading) {
      checkSuperAdminStatus();
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!authLoading && !checking) {
      if (!user) {
        navigate("/auth");
      } else if (isSuperAdmin === false) {
        toast.error("Access denied. Super Admin privileges required.");
        navigate("/admin");
      }
    }
  }, [user, isSuperAdmin, authLoading, checking, navigate]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
}
