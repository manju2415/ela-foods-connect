import { WifiOff, CloudOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { isOnline, pendingSync, syncPendingUpdates } = useOfflineSync();

  if (isOnline && pendingSync === 0) return null;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-50 px-4 py-2 flex items-center justify-between",
      isOnline 
        ? "bg-amber-500/90 text-amber-950" 
        : "bg-destructive/90 text-destructive-foreground"
    )}>
      <div className="flex items-center gap-2">
        {isOnline ? (
          <>
            <CloudOff className="h-4 w-4" />
            <span className="text-sm font-medium">
              {pendingSync} pending update{pendingSync > 1 ? 's' : ''} to sync
            </span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">
              You're offline
              {pendingSync > 0 && ` • ${pendingSync} pending`}
            </span>
          </>
        )}
      </div>
      
      {isOnline && pendingSync > 0 && (
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-7 text-amber-950 hover:bg-amber-600/20"
          onClick={syncPendingUpdates}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Sync
        </Button>
      )}
    </div>
  );
}
