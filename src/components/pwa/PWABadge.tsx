/// <reference types="vite-plugin-pwa/client" />

import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function PWABadge() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered:", r);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="bg-card border rounded-xl shadow-lg p-4 flex items-center gap-4">
        <RefreshCw className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Update Available</p>
          <p className="text-sm text-muted-foreground">A new version is ready</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={close}>
            Later
          </Button>
          <Button size="sm" onClick={() => updateServiceWorker(true)}>
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}
