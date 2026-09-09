// Guarded service-worker registration helpers.
// The app registers its PWA service worker ONLY from our own wrapper so that
// preview / dev / iframe / native-app contexts never install a stale worker.
import { Capacitor } from "@capacitor/core";

function hostnameBlocked(host: string): boolean {
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

/** Whether the app-shell service worker is allowed to register here. */
export function canRegisterSW(): boolean {
  if (typeof window === "undefined") return false; // SSR guard
  if (!import.meta.env.PROD) return false; // never in dev
  if (Capacitor.isNativePlatform()) return false; // native app updates via the app binary itself, not a web SW
  if (window.self !== window.top) return false; // never inside an iframe
  if (hostnameBlocked(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).has("sw=off")) return false;
  return true;
}

/** Remove any app-shell (/sw.js) registrations — used in contexts where we must not register. */
export async function unregisterStaleAppSW(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => /\/sw\.js$/.test(new URL(r.active?.scriptURL || r.scope, window.location.origin).pathname))
        .map((r) => r.unregister()),
    );
  } catch {
    // ignore — best effort cleanup
  }
}
