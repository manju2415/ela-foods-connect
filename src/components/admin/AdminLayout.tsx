import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      const { data } = await supabase.rpc("is_admin", { _user_id: user.id });
      setIsAdmin(!!data);
      setChecking(false);
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!authLoading && !checking) {
      if (!user) {
        navigate("/auth");
      } else if (isAdmin === false) {
        navigate("/");
      }
    }
  }, [user, isAdmin, authLoading, checking, navigate]);

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4">
            <SidebarTrigger />
            <h1 className="font-semibold text-lg">ELA Foods Admin</h1>
          </header>
          <div className="flex-1 p-6 bg-background">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
