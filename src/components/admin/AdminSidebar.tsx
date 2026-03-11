import { 
  Users, 
  Ticket, 
  Package, 
  ShoppingCart, 
  Settings, 
  LayoutDashboard, 
  FolderTree, 
  BadgePercent,
  Truck,
  ClipboardList,
  BarChart3,
  Boxes,
  UserCog,
  LucideIcon,
  Network,
  Banknote,
  MessageSquareQuote,
  Image,
  Megaphone,
  Crown,
  RotateCcw,
  FileText,
  Store,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUserRole } from "@/hooks/useUserRole";

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
  { title: "Banners", url: "/admin/banners", icon: Image },
  { title: "Advertisements", url: "/admin/advertisements", icon: Megaphone },
  { title: "Categories", url: "/admin/categories", icon: FolderTree },
  { title: "Products", url: "/admin/products", icon: Package },
  { title: "Inventory", url: "/admin/inventory", icon: Boxes },
  { title: "Coupons", url: "/admin/coupons", icon: BadgePercent },
  { title: "Testimonials", url: "/admin/testimonials", icon: MessageSquareQuote },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart },
  { title: "Order Assignments", url: "/admin/order-assignments", icon: ClipboardList },
  { title: "Delivery Partners", url: "/admin/delivery-partners", icon: Truck },
  { title: "Return Requests", url: "/admin/return-requests", icon: RotateCcw },
  { title: "Stores", url: "/admin/stores", icon: Store },
  { title: "Policies", url: "/admin/policies", icon: FileText, superAdminOnly: true },
  { title: "Settings", url: "/admin/settings", icon: Settings, superAdminOnly: true },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isSuperAdmin } = useUserRole();

  const visibleMenuItems = menuItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel>Admin Panel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                  >
                    <NavLink to={item.url} end>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
