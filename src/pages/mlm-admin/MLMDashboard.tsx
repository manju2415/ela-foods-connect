import { MLMAdminLayout } from "@/components/mlm-admin/MLMAdminLayout";
import { NetworkDashboardContent } from "@/components/mlm-admin/NetworkDashboardContent";

const MLMDashboard = () => {
  return (
    <MLMAdminLayout>
      <NetworkDashboardContent />
    </MLMAdminLayout>
  );
};

export default MLMDashboard;
