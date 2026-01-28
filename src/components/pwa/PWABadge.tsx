/// <reference types="vite-plugin-pwa/client" />

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function PWABadge() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setNeedRefresh(true);
              }
            });
          }
        });
      });
    }
  }, []);

  const updateServiceWorker = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-4 rounded-lg bg-primary p-4 text-primary-foreground shadow-lg md:left-auto md:right-4 md:w-auto">
      <span className="text-sm font-medium">New version available!</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={updateServiceWorker}
        className="shrink-0"
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Update
      </Button>
    </div>
  );
}
