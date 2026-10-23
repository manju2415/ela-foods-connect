import { lazy, ComponentType } from "react";
import { isOnSensitivePage } from "@/pwa/sw-guard";
import { isBusyForReload } from "@/pwa/reloadGuard";

const RETRY_FLAG = "lazy-retry-reload";

function markRecovered() {
  try {
    sessionStorage.removeItem(RETRY_FLAG);
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

/**
 * Drop-in replacement for React.lazy() that recovers from a stale service-worker
 * or browser cache serving an old build's chunk hashes after a redeploy — the
 * most common real-world cause of "app crashes on some phones when they open a
 * specific page" reports, since a deleted chunk 404s the dynamic import and
 * nothing about that failure is retried by default. One full reload fetches the
 * fresh index.html/asset manifest; a sessionStorage flag stops a genuinely
 * broken chunk from reload-looping forever.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own generic bound
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      markRecovered();
      return mod;
    } catch (error) {
      // Never force a reload while it could lose work: checkout/payment,
      // wallet, admin, OTP step, typed or edited fields. Throw instead and let
      // the error boundary handle it; the retry stays available later.
      if (isOnSensitivePage() || isBusyForReload(window)) {
        throw error;
      }

      let alreadyRetried = false;
      try {
        alreadyRetried = sessionStorage.getItem(RETRY_FLAG) === "1";
        if (!alreadyRetried) sessionStorage.setItem(RETRY_FLAG, "1");
      } catch {
        /* private browsing / storage unavailable — fall through to throw below */
      }

      if (!alreadyRetried) {
        window.location.reload();
        // The reload is about to replace the whole page — stay pending instead
        // of rendering an error screen for the instant before it does.
        return new Promise<{ default: T }>(() => {});
      }

      throw error;
    }
  });
}
