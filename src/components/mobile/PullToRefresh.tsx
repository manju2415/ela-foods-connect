import { ReactNode, TouchEvent } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  children: ReactNode;
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  pullProgress: number;
  shouldTrigger: boolean;
  handlers: {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function PullToRefresh({
  children,
  isPulling,
  isRefreshing,
  pullDistance,
  pullProgress,
  shouldTrigger,
  handlers,
}: PullToRefreshProps) {
  return (
    <div
      className="relative overflow-hidden"
      onTouchStart={handlers.onTouchStart}
      onTouchMove={handlers.onTouchMove}
      onTouchEnd={handlers.onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute left-0 right-0 flex items-center justify-center transition-opacity duration-200",
          (isPulling || isRefreshing) ? "opacity-100" : "opacity-0"
        )}
        style={{
          top: -60,
          height: 60,
          transform: `translateY(${pullDistance}px)`,
        }}
      >
        <div className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          shouldTrigger && "text-primary"
        )}>
          {isRefreshing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Refreshing...</span>
            </>
          ) : (
            <>
              <RefreshCw
                className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  shouldTrigger && "text-primary"
                )}
                style={{
                  transform: `rotate(${pullProgress * 180}deg)`,
                }}
              />
              <span>
                {shouldTrigger ? "Release to refresh" : "Pull to refresh"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Content with pull translation */}
      <div
        style={{
          transform: isPulling || isRefreshing
            ? `translateY(${pullDistance}px)`
            : "translateY(0)",
          transition: isPulling ? "none" : "transform 0.3s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
