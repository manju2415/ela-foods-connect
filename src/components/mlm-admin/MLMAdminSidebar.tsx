import {
  Users,
  Ticket,
  LayoutDashboard,
  LucideIcon,
  Network,
  Banknote,
  Crown,
  BarChart3,
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
} from "@/components/ui/sidebar";
import { useUserRole } from "@/hooks/useUserRole";

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/mlm-admin", icon: LayoutDashboard },
  { title: "Network Analytics", url: "/mlm-admin/network-analytics", icon: BarChart3 },
  { title: "Users", url: "/mlm-admin/users", icon: UserCog },
  { title: "Founding Members", url: "/mlm-admin/founding-members", icon: Users },
  { title: "Referral Codes", url: "/mlm-admin/referral-codes", icon: Ticket },
  { title: "Founders", url: "/mlm-admin/founders", icon: Crown },
  { title: "MLM Settings", url: "/mlm-admin/mlm-settings", icon: Network },
  { title: "Withdrawals", url: "/mlm-admin/withdrawals", icon: Banknote },
];

export function MLMAdminSidebar() {
  const location = useLocation();
  const { isSuperAdmin } = useUserRole();

  const visibleMenuItems = menuItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel>Network Manager</SidebarGroupLabel>
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
