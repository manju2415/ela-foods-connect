import { ReactNode } from "react";
import { MobileBottomNav } from "./MobileBottomNav";

type AppType = "customer" | "driver" | "member";

interface MobileAppLayoutProps {
  children: ReactNode;
  appType: AppType;
  hideNav?: boolean;
}

export function MobileAppLayout({ children, appType, hideNav = false }: MobileAppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background safe-area-pt">
      <div className="flex-1 md:pb-0 pb-16">
        {children}
      </div>
      {!hideNav && <MobileBottomNav appType={appType} />}
    </div>
  );
}
