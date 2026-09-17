import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { isOnSensitivePage } from "@/pwa/sw-guard";

/**
 * Registers the app-shell service worker and keeps every visitor current
 * automatically — including someone stuck on a build from days ago.
 *
 * Registered once at the app root (see src/App.tsx) and only mounted when
 * `canRegisterSW()` is true, so dev / Lovable preview / iframe contexts never
 * install a worker.
 *
 * Registration is done directly with navigator.serviceWorker.register()
 * instead of vite-plugin-pwa's generated register module: that module's own
 * update-prompt flow attaches its own `controllerchange` listener that
 * force-reloads unconditionally once it has seen a "waiting" worker — with no
 * way to veto it during checkout. Registering ourselves means our guarded
 * listener below is the only thing reacting to a control change.
 *
 * The generated service worker (vite.config.ts: workbox.skipWaiting +
 * clientsClaim) activates itself the moment the browser discovers a new
 * version. That check runs on the browser's OWN schedule (every navigation,
 * and at least every 24h per the Service Worker spec) — independent of
 * whatever JS is currently loaded on the page. That independence is what
 * actually rescues an already-stuck visitor: their current JS is exactly the
 * broken thing that would need to detect and apply an update, so nothing
 * about it can be trusted to fix itself.
 *
 * Once the new worker takes control of an open tab, `controllerchange` fires
 * (a native browser guarantee, not something any app bundle has to
 * implement) and we reload to actually pick up the new JS — except while the
 * user is on a checkout/payment page, where an unannounced reload could wipe
 * unsaved input or interrupt a live Razorpay iframe; there we keep checking
 * back every few seconds instead of forcing it.
 */

// How often to ask the browser to check for a new service worker while the
// tab is open, on top of the browser's own schedule — so a returning visitor
// who leaves a tab open for a long time still gets checked well inside 24h.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function PWABadge() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const reloadWhenSafe = () => {
      if (reloaded) return;
      if (isOnSensitivePage()) {
        retryTimer = setTimeout(reloadWhenSafe, 4000);
        return;
      }
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadWhenSafe);

    // No controller yet on this load means this is the first-ever install on
    // this device (nothing to reload away from), matching the old
    // `onOfflineReady` signal well enough for a cosmetic toast.
    const isFirstInstall = !navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registrationRef.current = registration;
        if (isFirstInstall) setOfflineReady(true);
      })
      .catch((error) => {
        console.error("[pwa] service worker registration error:", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadWhenSafe);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

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

  if (!offlineReady) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-4 rounded-lg bg-primary p-4 text-primary-foreground shadow-lg md:left-auto md:right-4 md:w-auto">
      <span className="text-sm font-medium">App is ready to work offline.</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOfflineReady(false)}
        className="shrink-0 text-primary-foreground hover:text-primary-foreground"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
