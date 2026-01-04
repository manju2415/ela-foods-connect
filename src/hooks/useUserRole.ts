import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRoles = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      const [adminResult, superAdminResult] = await Promise.all([
        supabase.rpc("is_admin", { _user_id: user.id }),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
      ]);

      setIsAdmin(!!adminResult.data);
      setIsSuperAdmin(!!superAdminResult.data);
      setLoading(false);
    };

    if (!authLoading) {
      checkRoles();
    }
  }, [user, authLoading]);

  return { isAdmin, isSuperAdmin, loading: authLoading || loading };
}
