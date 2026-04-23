import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isMLMAdmin, setIsMLMAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRoles = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsMember(false);
        setIsMLMAdmin(false);
        setLoading(false);
        return;
      }

      const [adminResult, superAdminResult, mlmAdminResult, memberResult] = await Promise.all([
        supabase.rpc("is_admin", { _user_id: user.id }),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
        supabase.rpc("is_mlm_admin", { _user_id: user.id }),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["founding_member", "member"]),
      ]);

      setIsAdmin(!!adminResult.data);
      setIsSuperAdmin(!!superAdminResult.data);
      setIsMLMAdmin(!!mlmAdminResult.data);
      setIsMember(!!(memberResult.data && memberResult.data.length > 0));
      setLoading(false);
    };

    if (!authLoading) {
      checkRoles();
    }
  }, [user, authLoading]);

  return { isAdmin, isSuperAdmin, isMember, isMLMAdmin, loading: authLoading || loading };
}
