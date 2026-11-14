// ─────────────────────────────────────────────────────────────────────────────
// Storefront maintenance mode
//
// TO TURN MAINTENANCE OFF: set MAINTENANCE_MODE to false and publish.
// Nothing else needs to change — no env vars, no database settings.
//
// What this does (frontend only):
//   • Public storefront visitors on the website see the maintenance page.
//   • Admin, MLM admin, login, delivery/driver, the native-app payment bridge
//     and legal/policy pages keep working (see OPEN_PATH_PREFIXES).
//   • The Android/iOS apps are never affected (Capacitor native check).
//   • Supabase APIs, edge functions and Razorpay webhooks are untouched —
//     they don't go through this React app at all.
//
// Team preview of the storefront while maintenance is on: open any page with
// ?maintenance_preview=1 (lasts for that browser tab; ?maintenance_preview=0
// clears it). This is a convenience, not a security control — the storefront
// is public anyway.
// ─────────────────────────────────────────────────────────────────────────────
import { Capacitor } from "@capacitor/core";

export const MAINTENANCE_MODE = true;

/** Paths that stay reachable during maintenance (prefix match on segment). */
export const OPEN_PATH_PREFIXES = [
  // Admin back office
  "/admin",
  "/mlm-admin",
  "/mlm-login",
  // Sign-in, needed for admins / delivery staff to reach their dashboards
  "/auth",
  "/role-redirect",
  // Delivery operations for orders already placed
  "/delivery",
  "/driver-app",
  // Opened by the Android/iOS apps in a browser tab to take Razorpay payments
  "/payment-bridge",
  // Legal pages (linked from the app stores / account deletion requirements)
  "/policies",
  "/privacy-policy",
  "/terms-and-conditions",
  "/user-agreement",
  "/account-deletion",
  "/delete-account",
];

const PREVIEW_KEY = "ela_maintenance_preview";

const isOpenPath = (pathname: string) =>
  OPEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

/** Reads/updates the per-tab preview flag from ?maintenance_preview=1|0. */
const hasPreviewBypass = (search: string): boolean => {
  try {
    const param = new URLSearchParams(search).get("maintenance_preview");
    if (param === "1") sessionStorage.setItem(PREVIEW_KEY, "1");
    if (param === "0") sessionStorage.removeItem(PREVIEW_KEY);
    return sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
};

export const shouldShowMaintenance = (pathname: string, search: string): boolean => {
  if (!MAINTENANCE_MODE) return false;
  if (Capacitor.isNativePlatform()) return false;
  if (isOpenPath(pathname)) return false;
  if (hasPreviewBypass(search)) return false;
  return true;
};
