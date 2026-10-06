import { ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Skeleton } from "@/components/ui/skeleton";

// Screens that keep their current dialogs (operational / member / admin).
const NO_SHEET_PREFIXES = ["/admin", "/mlm-admin", "/driver-app", "/delivery", "/member-app", "/dashboard", "/mlm-login"];

/**
 * Installed-app wrapper around the routes: a short fade on every screen change
 * and the per-route `native-sheets` class (bottom-sheet dialogs on customer
 * shopping screens only). On the website it renders the children untouched.
 */
export function NativeAppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;
    document.documentElement.classList.toggle(
      "native-sheets",
      !NO_SHEET_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
    );
    // Restart the fade without remounting the page.
    const el = ref.current;
    if (!el) return;
    el.classList.remove("app-page-enter");
    void el.offsetWidth;
    el.classList.add("app-page-enter");
  }, [pathname, isNative]);

  if (!isNative) return <>{children}</>;
  return <div ref={ref}>{children}</div>;
}

/** App-style loading placeholder (top bar + content blocks) instead of a spinner. */
export function NativePageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="safe-area-pt border-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-5 w-36" />
        </div>
      </div>
      <div className="space-y-4 p-4">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
