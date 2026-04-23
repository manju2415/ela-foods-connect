import { AdminLayout } from "@/components/admin/AdminLayout";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { NetworkDashboardContent } from "@/components/mlm-admin/NetworkDashboardContent";

const NetworkAdmin = () => {
  return (
    <SuperAdminGuard>
      <AdminLayout>
        <NetworkDashboardContent />
      </AdminLayout>
    </SuperAdminGuard>
  );
};

export default NetworkAdmin;