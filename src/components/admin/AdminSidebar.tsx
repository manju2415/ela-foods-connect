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

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
  { title: "Users", url: "/admin/users", icon: UserCog },
  { title: "Founding Members", url: "/admin/founding-members", icon: Users },
  { title: "Referral Codes", url: "/admin/referral-codes", icon: Ticket },
  { title: "Categories", url: "/admin/categories", icon: FolderTree },
  { title: "Products", url: "/admin/products", icon: Package },
  { title: "Inventory", url: "/admin/inventory", icon: Boxes },
  { title: "Coupons", url: "/admin/coupons", icon: BadgePercent },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart },
  { title: "Order Assignments", url: "/admin/order-assignments", icon: ClipboardList },
  { title: "Delivery Partners", url: "/admin/delivery-partners", icon: Truck },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel>Admin Panel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
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
