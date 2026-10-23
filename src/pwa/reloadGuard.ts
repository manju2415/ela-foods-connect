// Decides whether a login / signup screen can be reloaded for a new version
// without losing anything the customer has done there.

// Screens where a reload could lose a half-finished sign-in or registration.
export const FORM_PATH_PREFIXES = ["/auth", "/mlm-login", "/signup", "/founder-signup", "/complete-registration"];

type FieldLike = { value?: string; type?: string };
type DocLike = { querySelectorAll(selector: string): ArrayLike<FieldLike> };

/**
 * True when the page holds work a reload would wipe: any typed text in a
 * field, or an OTP step on screen (even empty — the customer may be waiting
 * for the SMS, and a reload would send them back to the phone-number step).
 */
export function hasUnsavedFormState(doc: DocLike): boolean {
  if (doc.querySelectorAll("[data-input-otp], input[autocomplete='one-time-code']").length > 0) return true;
  const fields = Array.from(doc.querySelectorAll("input, textarea, select"));
  return fields.some((f) => {
    const t = (f.type || "").toLowerCase();
    if (t === "hidden" || t === "checkbox" || t === "radio" || t === "submit" || t === "button") return false;
    return (f.value || "").trim() !== "";
  });
}

/** Whether a reload must wait on this form screen. Other paths: false. */
export function formScreenBlocksReload(path: string, doc: DocLike): boolean {
  if (!FORM_PATH_PREFIXES.some((p) => path.startsWith(p))) return false;
  return hasUnsavedFormState(doc);
}
