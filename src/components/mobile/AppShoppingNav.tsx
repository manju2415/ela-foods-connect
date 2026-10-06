import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileBottomNav } from "./MobileBottomNav";

// Main shopping screens that keep the app's bottom tabs.
const SHOPPING_ROUTES = [/^\/products\/?$/, /^\/categories\/?$/, /^\/category\//, /^\/product\//];

/**
 * Installed-app replacement for the website Footer: on the main shopping
 * screens it shows the app's bottom tabs (member tabs for members, customer
 * tabs otherwise) plus a spacer so page content isn't hidden behind them.
 * Elsewhere (checkout, info pages) it renders nothing.
 */
export function AppShoppingNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const showNav = SHOPPING_ROUTES.some((route) => route.test(pathname));

  // Cached per user, like the Header's role lookup — this remounts on every page.
  const { data: isMember, isLoading } = useQuery({
    queryKey: ["app-nav-is-member", user?.id],
    enabled: showNav && !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .in("role", ["member", "founding_member"])
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });

  if (!showNav) return null;

  return (
    <>
      <div aria-hidden className="md:hidden" style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }} />
      {!(user && isLoading) && <MobileBottomNav appType={isMember ? "member" : "customer"} />}
    </>
  );
}
