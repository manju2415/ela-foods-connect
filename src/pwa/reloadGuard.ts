// One shared answer to "may this page be reloaded automatically right now?"
// Used by every automatic reload path: the service-worker update listener
// (PWABadge) and lazy-import recovery (lazyWithRetry). The service worker
// itself cannot see page state, so it never reloads visible tabs.

// Screens where a reload could lose a half-finished sign-in or registration.
export const FORM_PATH_PREFIXES = ["/auth", "/mlm-login", "/signup", "/founder-signup", "/complete-registration"];

// Screens that are never reloaded automatically: checkout / payment / wallet
// (a Razorpay sheet may be open) and admin (unsaved edits).
export const NEVER_RELOAD_PATH_PREFIXES = [
  "/checkout",
  "/guest-checkout",
  "/registration-payment",
  "/payment-bridge",
  "/customer-app/wallet",
  "/member-app/wallet",
  "/admin",
  "/mlm-admin",
];

type FieldLike = {
  value?: string;
  type?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  getClientRects?: () => { length: number };
};
type DocLike = { querySelectorAll(selector: string): ArrayLike<FieldLike> };

/**
 * True when the page holds work a reload would wipe: any typed text in a
 * field, a changed checkbox/radio, or an OTP step on screen (even empty — the
 * customer may be waiting for the SMS).
 */
export function hasUnsavedFormState(doc: DocLike): boolean {
  if (doc.querySelectorAll("[data-input-otp], input[autocomplete='one-time-code']").length > 0) return true;
  const fields = Array.from(doc.querySelectorAll("input, textarea, select"));
  return fields.some((f) => {
    const t = (f.type || "").toLowerCase();
    if (t === "hidden" || t === "submit" || t === "button") return false;
    if (t === "checkbox" || t === "radio") return !!f.checked !== !!f.defaultChecked;
    return (f.value || "").trim() !== "";
  });
}

/** Whether a reload must wait on this form screen. Other paths: false. */
export function formScreenBlocksReload(path: string, doc: DocLike): boolean {
  if (!FORM_PATH_PREFIXES.some((p) => path.startsWith(p))) return false;
  return hasUnsavedFormState(doc);
}

// ---- edit tracking (any page) ----
// Catches edits in uncontrolled or unfocused fields that a DOM scan cannot
// tell apart from defaults. Cleared when the customer moves to another page.
let editedOnPath: string | null = null;

export function noteUserEdit(path: string) {
  editedOnPath = path;
}

export function hasUserEditedOn(path: string): boolean {
  return editedOnPath === path;
}

let trackerInstalled = false;
export function installEditTracker() {
  const g = globalThis as unknown as {
    document?: { addEventListener(t: string, f: () => void, c: boolean): void };
    location?: { pathname: string };
  };
  if (trackerInstalled || !g.document) return;
  trackerInstalled = true;
  const mark = () => noteUserEdit(g.location?.pathname ?? "");
  g.document.addEventListener("input", mark, true);
  g.document.addEventListener("change", mark, true);
}

type WinLike = {
  location: { pathname: string };
  document: DocLike & {
    activeElement: { tagName?: string; isContentEditable?: boolean } | null;
    querySelectorAll(selector: string): ArrayLike<FieldLike & { getClientRects?: () => { length: number } }>;
  };
};

/** True while an automatic reload could lose input, OTP progress or a payment. */
export function isBusyForReload(win: WinLike): boolean {
  const path = win.location.pathname;
  if (NEVER_RELOAD_PATH_PREFIXES.some((p) => path.startsWith(p))) return true;
  if (formScreenBlocksReload(path, win.document)) return true;
  if (hasUserEditedOn(path)) return true;
  // Only a rendered Razorpay container means a payment sheet is open.
  const rz = Array.from(win.document.querySelectorAll(".razorpay-container, iframe.razorpay-checkout-frame"));
  if (rz.some((el) => (el.getClientRects?.().length ?? 0) > 0)) return true;
  const el = win.document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
  return false;
}
