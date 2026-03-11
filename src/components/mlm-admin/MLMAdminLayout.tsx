import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { MLMAdminSidebar } from "./MLMAdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, ExternalLink, Network } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MLMAdminLayoutProps {
  children: ReactNode;
}

export function MLMAdminLayout({ children }: MLMAdminLayoutProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/mlm-login");
  };

  const handleVisitSite = () => {
    window.open("/", "_blank");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <MLMAdminSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4">
            <SidebarTrigger />
            <Network className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-lg flex-1">ELA Network Manager</h1>
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
