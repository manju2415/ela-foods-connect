import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLayoutOverride } from "@/contexts/AdminLayoutContext";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const LayoutOverride = useLayoutOverride();

  const isMLMRoute = location.pathname.startsWith("/mlm-admin");

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      // For MLM routes, also allow founding_member role
      if (isMLMRoute) {
        const [adminRes, founderRes] = await Promise.all([
          supabase.rpc("is_admin", { _user_id: user.id }),
          supabase.rpc("has_role", { _user_id: user.id, _role: "founding_member" }),
        ]);
        setIsAdmin(!!adminRes.data || !!founderRes.data);
      } else {
        const { data } = await supabase.rpc("is_admin", { _user_id: user.id });
        setIsAdmin(!!data);
      }
      setChecking(false);
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading, isMLMRoute]);

  useEffect(() => {
    if (!authLoading && !checking) {
      if (!user) {
        navigate(isMLMRoute ? "/mlm-login" : "/auth");
      } else if (isAdmin === false) {
        navigate(isMLMRoute ? "/mlm-login" : "/");
      }
    }
  }, [user, isAdmin, authLoading, checking, navigate, isMLMRoute]);

  const handleLogout = async () => {
    try { await signOut(); } catch (_) { /* session may already be expired */ }
    navigate("/auth", { replace: true });
  };

  const handleVisitSite = () => {
    window.open("/", "_blank");
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  if (LayoutOverride) {
    return <LayoutOverride>{children}</LayoutOverride>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4">
            <SidebarTrigger />
            <h1 className="font-semibold text-lg flex-1">ELA Foods Admin</h1>
            <Button variant="ghost" size="sm" onClick={handleVisitSite}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Site
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </header>
          <div className="flex-1 p-6 bg-background">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
