import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { shouldShowMaintenance } from "@/config/maintenance";
import MaintenancePage from "@/pages/Maintenance";

/**
 * Shows the maintenance page instead of the storefront while
 * MAINTENANCE_MODE is on. Admin/operational routes, native apps and all
 * backend traffic pass straight through — see src/config/maintenance.ts.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (shouldShowMaintenance(location.pathname, location.search)) {
    return <MaintenancePage />;
  }
  return <>{children}</>;
}
