import { Capacitor, registerPlugin } from "@capacitor/core";

// Light haptic feedback for the installed app. Uses the official Capacitor
// Haptics plugin when its native side is installed (`npm i @capacitor/haptics`
// + `npx cap sync`), otherwise falls back to a short vibration where the
// WebView allows it. Never throws and is a no-op on the website.
interface HapticsPlugin {
  impact(options: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
  notification(options: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>;
}

const Haptics = registerPlugin<HapticsPlugin>("Haptics");

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
};

/** Light tap — add to cart, quantity change. */
export function hapticTap() {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.isPluginAvailable("Haptics")) {
    Haptics.impact({ style: "LIGHT" }).catch(() => {});
  } else {
    vibrate(10);
  }
}

/** Success — order placed / payment successful. */
export function hapticSuccess() {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.isPluginAvailable("Haptics")) {
    Haptics.notification({ type: "SUCCESS" }).catch(() => {});
  } else {
    vibrate([15, 60, 25]);
  }
}
