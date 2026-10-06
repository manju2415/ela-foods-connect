import { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefresh } from "./PullToRefresh";

/**
 * Pull-to-refresh for page content in the installed app, built on the
 * existing PullToRefresh + usePullToRefresh. Renders children untouched on the
 * website. Wrap page content only — not top bars or bottom tabs (the pull
 * effect transforms its content, which would move fixed bars inside it).
 */
export function AppPullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: async () => {
      await onRefresh();
    },
  });

  if (!Capacitor.isNativePlatform()) return <>{children}</>;

  return (
    <PullToRefresh
      isPulling={isPulling}
      isRefreshing={isRefreshing}
      pullDistance={pullDistance}
      pullProgress={pullProgress}
      shouldTrigger={shouldTrigger}
      handlers={handlers}
    >
      {children}
    </PullToRefresh>
  );
}
