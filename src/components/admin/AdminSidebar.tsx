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
  storeAdminVisible?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, superAdminOnly: true },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3, superAdminOnly: true },
  { title: "Banners", url: "/admin/banners", icon: Image, superAdminOnly: true },
  { title: "Advertisements", url: "/admin/advertisements", icon: Megaphone, superAdminOnly: true },
  { title: "Categories", url: "/admin/categories", icon: FolderTree, storeAdminVisible: true },
  { title: "Products", url: "/admin/products", icon: Package, storeAdminVisible: true },
  { title: "Inventory", url: "/admin/inventory", icon: Boxes, storeAdminVisible: true },
  { title: "Coupons", url: "/admin/coupons", icon: BadgePercent, superAdminOnly: true },
  { title: "Testimonials", url: "/admin/testimonials", icon: MessageSquareQuote, superAdminOnly: true },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart, storeAdminVisible: true },
  { title: "Order Assignments", url: "/admin/order-assignments", icon: ClipboardList, storeAdminVisible: true },
  { title: "Delivery Partners", url: "/admin/delivery-partners", icon: Truck, storeAdminVisible: true },
  { title: "Return Requests", url: "/admin/return-requests", icon: RotateCcw, storeAdminVisible: true },
  { title: "Users", url: "/admin/users", icon: Users, storeAdminVisible: true },
  { title: "Stores", url: "/admin/stores", icon: Store, storeAdminVisible: true },
  { title: "Inventory", url: "/admin/inventory", icon: Boxes, storeAdminVisible: true },
  { title: "Policies", url: "/admin/policies", icon: FileText, superAdminOnly: true },
  { title: "Settings", url: "/admin/settings", icon: Settings, superAdminOnly: true },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isSuperAdmin } = useUserRole();

  const visibleMenuItems = menuItems.filter((item) => {
    if (isSuperAdmin) return true;
    // Store admin: only see items marked storeAdminVisible
    return item.storeAdminVisible;
  });

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
