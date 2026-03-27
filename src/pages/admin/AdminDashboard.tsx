import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, FolderTree, IndianRupee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface Stats {
  categories: number;
  products: number;
  orders: number;
  revenue: number;
}

const AdminDashboard = () => {
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    categories: 0,
    products: 0,
    orders: 0,
    revenue: 0,
  });

  // Redirect store admins away from dashboard
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/products", { replace: true });
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const fetchStats = async () => {
      const [categoriesRes, productsRes, ordersRes, revenueRes] = await Promise.all([
        supabase.from("categories").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("products").select("id", { count: "exact" }),
        supabase.from("orders").select("id", { count: "exact" }),
        supabase.from("orders").select("total_amount").eq("status", "delivered"),
      ]);

      const totalRevenue = (revenueRes.data || []).reduce((sum, o) => sum + Number(o.total_amount), 0);

      setStats({
        categories: categoriesRes.count || 0,
        products: productsRes.count || 0,
        orders: ordersRes.count || 0,
        revenue: totalRevenue,
      });
    };

    fetchStats();
  }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  const statCards = [
    { title: "Revenue", value: `₹${stats.revenue.toLocaleString()}`, icon: IndianRupee, color: "text-green-600" },
    { title: "Orders", value: stats.orders, icon: ShoppingCart, color: "text-primary" },
    { title: "Products", value: stats.products, icon: Package, color: "text-accent" },
    { title: "Categories", value: stats.categories, icon: FolderTree, color: "text-secondary" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your platform</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
