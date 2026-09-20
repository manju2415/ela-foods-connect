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
 * version. That check runs on the browser's OWN schedule (on navigation, but
 * at most once per 24h) — independent of whatever JS is currently loaded on
 * the page. That independence is what actually rescues an already-stuck
 * visitor: their current JS is exactly the broken thing that would need to
 * detect and apply an update, so nothing about it can be trusted to fix
 * itself. On top of that, this component asks explicitly (registration.update())
 * at startup, on focus / visible / pageshow / online, and every 5 minutes
 * while visible as a fallback, so up-to-date pages don't wait for the browser's 24h throttle.
 *
 * Once the new worker takes control of an open tab, `controllerchange` fires
 * (a native browser guarantee, not something any app bundle has to
 * implement) and we reload to actually pick up the new JS — except while the
 * user is mid checkout/payment/typing, where an unannounced reload could wipe
 * unsaved input or interrupt a live Razorpay iframe; there we keep checking
 * back every few seconds instead of forcing it.
 */

// How often to ask the browser to check for a new service worker while the
// tab is open, on top of the browser's own schedule — so a returning visitor
// who leaves a tab open for a long time still gets checked well inside 24h.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;

// Explicit update() calls (focus / visible / online / interval) are coalesced
// to at most one per this window, so several events firing together cost one
// small sw.js request rather than a burst.
const MIN_UPDATE_GAP_MS = 30_000;

// Safety net against any reload loop: never reload for a worker change twice
// within this window in the same tab.
const RELOAD_GUARD_KEY = "ela-sw-reload-at";
const RELOAD_GUARD_MS = 30_000;

// Extra places (beyond isOnSensitivePage) where an unannounced reload could
// lose money-related state: wallet top-up screens launch Razorpay too.
const NO_RELOAD_PATH_PREFIXES = ["/customer-app/wallet", "/member-app/wallet"];

/** True while a reload could wipe input or interrupt a live payment. */
function isBusyForReload(): boolean {
  if (isOnSensitivePage()) return true;
  const path = window.location.pathname;
  if (NO_RELOAD_PATH_PREFIXES.some((p) => path.startsWith(p))) return true;
  // Razorpay's checkout is injected into the page as a container/iframe. Its
  // script keeps a hidden (display:none) container in the DOM after loading,
  // so only an actually rendered one (getClientRects is empty for display:none
  // or a hidden ancestor) means a payment sheet is open.
  const razorpayEls = document.querySelectorAll(".razorpay-container, iframe.razorpay-checkout-frame");
  if (Array.from(razorpayEls).some((el) => el.getClientRects().length > 0)) return true;
  // Someone is typing (e.g. entering an OTP) — don't wipe it.
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return true;
  return false;
}

function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    return Date.now() - at < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

function markReloading() {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the in-memory `reloaded` flag still applies */
  }
}

export function PWABadge() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // The very first controllerchange on a device with no controller is just
    // the new worker claiming an already-fresh page (clientsClaim) — nothing
    // stale to replace, so don't reload brand-new visitors. Every later
    // controllerchange is a real version swap.
    let hadController = !!navigator.serviceWorker.controller;
    const reloadWhenSafe = () => {
      if (reloaded) return;
      if (isBusyForReload()) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(reloadWhenSafe, 4000);
        return;
      }
      if (reloadedRecently()) return;
      reloaded = true;
      markReloading();
      window.location.reload();
    };
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      reloadWhenSafe();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // No controller yet on this load means this is the first-ever install on
    // this device (nothing to reload away from), matching the old
    // `onOfflineReady` signal well enough for a cosmetic toast.
    const isFirstInstall = !navigator.serviceWorker.controller;
    navigator.serviceWorker
      // updateViaCache "none": always revalidate sw.js AND anything it imports.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        registrationRef.current = registration;
        if (isFirstInstall) setOfflineReady(true);
        // register() on an already-registered worker does NOT check for a
        // newer version, and the browser's own navigation check is throttled
        // to once per 24h — so ask explicitly once at startup.
        registration.update().catch(() => {
          // Best-effort — the interval / focus checks will retry.
        });
      })
      .catch((error) => {
        console.error("[pwa] service worker registration error:", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    let lastCheckAt = 0;
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheckAt < MIN_UPDATE_GAP_MS) return;
      lastCheckAt = now;
      registrationRef.current?.update().catch(() => {
        // Best-effort — a failed check just means we try again next tick.
      });
    };

    const intervalId = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    // Also check whenever the user returns: tab visible again, window focus,
    // restored from the back/forward cache, or the network comes back — so a
    // long-idle or backgrounded app doesn't wait for the next interval tick.
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("pageshow", checkForUpdate);
    window.addEventListener("online", checkForUpdate);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("pageshow", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
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
