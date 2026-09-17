/// <reference types="vite-plugin-pwa/react" />

import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { isOnSensitivePage } from "@/pwa/sw-guard";

/**
 * Single PWA service-worker registration + update prompt.
 *
 * Registered once at the app root (see src/App.tsx) and only mounted when
 * `canRegisterSW()` is true, so dev / Lovable preview / iframe contexts never
 * install a worker.
 *
 * Uses vite-plugin-pwa's official hook (reliable `onNeedRefresh` instead of a
 * hand-rolled `updatefound` listener, which was racy and frequently missed the
 * "new version" signal — leaving returning visitors stuck on a stale build.
 *
 * When a new version is waiting it shows a toast and auto-applies after a short
 * delay so users always land on the latest version without manual action —
 * unless they're on a checkout/payment page (where a forced reload would wipe
 * unsaved input) or explicitly dismiss it, in which case it waits.
 */

// How often to ask the browser to check for a new service worker while the
// tab is open. Without this, the check only happens on the browser's own
// schedule (mainly full navigations), which in an SPA can mean a returning
// visitor who never does a hard reload stays on a stale cached build
// indefinitely — this is what left real customers unable to log in after a
// deploy, since their cached bundle was calling an auth path that no longer
// matched the backend.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function PWABadge() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
    },
    onRegisterError(error) {
      console.error("[pwa] service worker registration error:", error);
    },
  });

  useEffect(() => {
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registrationRef.current?.update().catch(() => {
          // Best-effort — a failed check just means we try again next tick.
        });
      }
    };

    const intervalId = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    // Also check immediately whenever the tab regains focus, so switching
    // back to a long-idle tab doesn't wait for the next interval tick.
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!needRefresh) return;
    // Auto-apply the update shortly after it's detected so returning users
    // end up on the newest version — but never yank the page out from under
    // an in-progress checkout/payment; keep checking back instead.
    const tryAutoUpdate = () => {
      if (isOnSensitivePage()) {
        autoTimer.current = setTimeout(tryAutoUpdate, 4000);
        return;
      }
      updateServiceWorker(true);
    };
    autoTimer.current = setTimeout(tryAutoUpdate, 4000);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [needRefresh, updateServiceWorker]);

  const dismissRefresh = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setNeedRefresh(false);
  };

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-4 rounded-lg bg-primary p-4 text-primary-foreground shadow-lg md:left-auto md:right-4 md:w-auto">
      <span className="text-sm font-medium">
        {needRefresh ? "New version available!" : "App is ready to work offline."}
      </span>
      {needRefresh ? (
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="secondary" onClick={() => updateServiceWorker(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Update now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismissRefresh}
            className="text-primary-foreground hover:text-primary-foreground"
            aria-label="Dismiss update notice"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOfflineReady(false)}
          className="shrink-0 text-primary-foreground hover:text-primary-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
