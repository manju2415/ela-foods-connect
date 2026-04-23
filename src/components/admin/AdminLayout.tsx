import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, LogOut, ExternalLink } from "lucide-react";
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
  const showBackButton = !isMLMRoute && location.pathname !== "/admin";

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      if (isMLMRoute) {
        const { data } = await supabase.rpc("is_mlm_admin", { _user_id: user.id });
        setIsAdmin(!!data);
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

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/admin", { replace: true });
    }
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
          <header className="h-14 border-b border-border bg-card flex items-center px-2 sm:px-4 gap-1.5 sm:gap-4 overflow-hidden">
            <SidebarTrigger className="shrink-0" />
            {showBackButton && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="h-9 w-9 shrink-0" aria-label="Go back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h1 className="font-semibold text-base sm:text-lg flex-1 min-w-0 truncate whitespace-nowrap">Ela Bazar Admin</h1>
            <Button variant="ghost" size="sm" onClick={handleVisitSite} className="shrink-0 px-2 sm:px-3" aria-label="Visit site">
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Visit Site</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="shrink-0 px-2 sm:px-3" aria-label="Logout">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </header>
          <div className="flex-1 p-3 sm:p-4 lg:p-6 bg-background">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
