import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapacitorApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { realEmailOrEmpty } from "@/lib/email";
import {
  PaymentError,
  buildBridgePayload,
  encodeBridgePayload,
  paymentErrorFromInvoke,
  type PreparedRazorpayOrder,
} from "@/utils/paymentBridge";

export { PaymentError } from "@/utils/paymentBridge";


// The exact message used everywhere below when the user closes the checkout
// modal without paying — not an actual payment failure, so callers should
// show a neutral notice rather than a "Payment Failed" error toast.
export const PAYMENT_CANCELLED_MESSAGE = "Payment cancelled by user";
export const isPaymentCancelled = (error: unknown): boolean =>
  !!error && typeof error === "object" && "message" in error && (error as { message?: string }).message === PAYMENT_CANCELLED_MESSAGE;

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayPaymentFailedResponse {
  error: { code?: string; description?: string; [key: string]: unknown };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayPaymentFailedResponse) => void) => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay: RazorpayConstructor;
  }
}

export interface PaymentAttemptContext {
  purpose?: string;
  user_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items?: Array<{ product_id: string; quantity: number; variant_id?: string | null }>;
  guest_details?: Record<string, unknown> | null;
  coupon_code?: string | null;
  discount_amount?: number;
  // Payment-first member checkout: the full cart, quoted server-side by
  // razorpay-create-order and stored so the order is created after payment.
  checkout?: Record<string, unknown>;
}

export interface RazorpayPaymentOptions {
  amount: number; // in INR (rupees, not paise)
  receipt?: string;
  notes?: Record<string, string>;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  orderId?: string; // internal order id for verification
  purpose?: string;
  /**
   * Recorded server-side the moment the payment is verified, BEFORE the order is
   * created. If order creation then fails, the payment is still on record and can
   * be reconciled into an order by an admin.
   */
  attemptContext?: PaymentAttemptContext;
  /**
   * A Razorpay order already created by razorpay-create-order. Set by the
   * native app before handing off to /payment-bridge, whose browser tab has
   * no Supabase session; checkout then opens against it without calling
   * razorpay-create-order again.
   */
  preparedOrder?: PreparedRazorpayOrder;
  onSuccess: (response: RazorpayCheckoutResponse) => void;
  onFailure: (error: { message?: string; description?: string }) => void;
}

// Live website URL, used only when running in the native app: Razorpay's UPI
// app-detection (Google Pay, PhonePe, ...) doesn't work inside the app's own
// embedded WebView, only in a real browser context, so native builds open
// checkout in an in-app browser tab against this page instead.
// VITE_PAYMENT_BRIDGE_URL overrides it for local device testing only
// (e.g. http://localhost:8080/payment-bridge with `adb reverse tcp:8080 tcp:8080`).
const PAYMENT_BRIDGE_URL = import.meta.env.VITE_PAYMENT_BRIDGE_URL || "https://elabazar.com/payment-bridge";
const PAYMENT_CALLBACK_SCHEME = "elabazarpay://payment-callback";

const formatRazorpayContact = (contact?: string) => {
  const digits = (contact || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.length > 10 ? digits.slice(-10) : digits;
};

const loadRazorpayScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay SDK")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => {
      // Drop the failed tag so the next attempt injects a fresh one instead
      // of waiting on a tag whose error event has already fired.
      script.remove();
      reject(new Error("Failed to load Razorpay SDK"));
    };
    document.head.appendChild(script);
  });
};

/**
 * Starts downloading Razorpay's checkout script in the background. The script
 * is no longer loaded on every page from index.html, so pages that can take a
 * payment call this when they open — it is then already there by the time the
 * customer taps Pay. Purely a head start: openRazorpayCheckout still waits
 * for the script itself, so a failure here is harmless. Skipped in the native
 * app, which never opens checkout in its own WebView (see
 * initiateRazorpayPayment below).
 */
export const preloadRazorpayScript = () => {
  if (Capacitor.isNativePlatform()) return;
  loadRazorpayScript().catch(() => {});
};

/**
 * Step 1 of checkout: creates the Razorpay order via the edge function, which
 * also records a "payment started" row server-side, before the customer sees
 * the payment sheet, so the payment is never untraceable even if they never
 * come back. Sent with the caller's Supabase session — for member orders the
 * server quotes the amount from the signed-in customer's cart.
 */
export const createRazorpayOrder = async (
  options: Omit<RazorpayPaymentOptions, "onSuccess" | "onFailure">,
): Promise<PreparedRazorpayOrder> => {
  const customerEmail = realEmailOrEmpty(options.prefill?.email);
  type CreateOrderResponse = Partial<PreparedRazorpayOrder> & { error?: string; code?: string };
  let result: { data: CreateOrderResponse | null; error: unknown };
  try {
    result = await supabase.functions.invoke<CreateOrderResponse>("razorpay-create-order", {
      body: {
        amount: options.amount,
        receipt: options.receipt || `rcpt_${Date.now()}`,
        notes: { ...(options.notes || {}), ...(customerEmail ? { email: customerEmail } : {}) },
        purpose: options.purpose,
        orderId: options.orderId,
        attemptContext: options.attemptContext,
      },
    });
  } catch (err) {
    throw await paymentErrorFromInvoke({ name: "FunctionsFetchError", cause: err }, null);
  }

  const { data, error } = result;
  if (error || !data?.order_id) {
    const paymentError = await paymentErrorFromInvoke(error, data);
    console.error("[razorpay] create-order failed:", paymentError.kind, paymentError.code ?? "");
    throw paymentError;
  }
  return { order_id: data.order_id, amount: Number(data.amount), currency: String(data.currency), key_id: String(data.key_id) };
};

/**
 * Opens Razorpay's own Checkout modal in the current page and verifies the
 * payment server-side. Works correctly in any real browser (mobile web,
 * desktop web, and the in-app browser tab opened by the payment bridge page
 * for native builds) — just not inside a bare embedded WebView, which is why
 * native builds never call this directly (see initiateRazorpayPayment below).
 */
export const openRazorpayCheckout = async (options: RazorpayPaymentOptions) => {
  // Ensure Razorpay SDK is loaded
  try {
    await loadRazorpayScript();
  } catch {
    throw new PaymentError("checkout", "Could not load the payment window. Check your internet connection and try again.");
  }
  if (!window.Razorpay) {
    throw new PaymentError("checkout", "Razorpay SDK failed to initialize. Please refresh and try again.");
  }

  // Only send real customer emails to Razorpay (never internal placeholders)
  const customerEmail = realEmailOrEmpty(options.prefill?.email);

  // Step 1: Create the Razorpay order (skipped when the native app already did).
  const data = options.preparedOrder ?? (await createRazorpayOrder(options));

  // Step 2: Open Razorpay checkout
  const rzpOptions = {
    key: data.key_id,
    amount: data.amount,
    currency: data.currency,
    name: "Ela Bazar",
    description: options.notes?.description || "Payment",
    order_id: data.order_id,
    prefill: {
      name: options.prefill?.name || "",
      email: customerEmail,
      contact: formatRazorpayContact(options.prefill?.contact),
    },

    theme: {
      color: "#f97316",
    },
    handler: async (response: RazorpayCheckoutResponse) => {
      // Step 3: Verify payment
      try {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          "razorpay-verify-payment",
          {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              order_id: options.orderId,
              amount: options.amount,
              attempt: options.attemptContext
                ? { ...options.attemptContext, amount: options.amount }
                : null,
              purpose: options.purpose,

            },
          }
        );

        if (verifyError || !verifyData?.verified) {
          options.onFailure(new Error(
            verifyData?.needs_refund
              ? `Payment received, but the order could not be completed (${verifyData?.error || "unknown reason"}). Our team will refund you or contact you.`
              : "Payment verification failed",
          ));
          return;
        }

        options.onSuccess(response);
      } catch (err) {
        options.onFailure(err instanceof Error ? err : { message: String(err) });
      }
    },
    modal: {
      ondismiss: () => {
        options.onFailure(new Error("Payment cancelled by user"));
      },
    },
  };

  const rzp = new window.Razorpay(rzpOptions);
  rzp.on("payment.failed", (response) => {
    options.onFailure(response.error);
  });
  rzp.open();
};

/**
 * Native-only path: hands the payment off to a real browser tab (Chrome
 * Custom Tabs) pointed at the live site's /payment-bridge page, which runs
 * openRazorpayCheckout in a context where Razorpay can actually detect UPI
 * apps. The bridge redirects to a custom-scheme deep link with the result,
 * which we catch here and translate back into the normal onSuccess/onFailure
 * callbacks, so callers don't need to know which path was taken.
 *
 * The Razorpay order is created here, in the app, where the customer's
 * Supabase session lives — the Custom Tab is a separate browser with no
 * session, so razorpay-create-order (which needs it for member orders) can't
 * be called from there. Only the resulting order id goes to the bridge; no
 * access/refresh token is ever put in the URL.
 */
const initiateRazorpayPaymentNative = async (options: RazorpayPaymentOptions) => {
  const { onSuccess, onFailure, ...serializable } = options;
  const preparedOrder = await createRazorpayOrder(serializable);
  const payloadParam = encodeBridgePayload(buildBridgePayload(serializable, preparedOrder));
  const url = `${PAYMENT_BRIDGE_URL}?payload=${payloadParam}`;

  let settled = false;
  let appUrlListener: { remove: () => void } | null = null;
  let browserFinishedListener: { remove: () => void } | null = null;

  const cleanup = async () => {
    appUrlListener?.remove();
    browserFinishedListener?.remove();
    try {
      await Browser.close();
    } catch {
      // already closed
    }
  };

  appUrlListener = await CapacitorApp.addListener("appUrlOpen", async ({ url: openedUrl }) => {
    if (settled || !openedUrl.startsWith(PAYMENT_CALLBACK_SCHEME)) return;
    settled = true;
    await cleanup();

    const params = new URL(openedUrl).searchParams;
    if (params.get("status") === "success") {
      onSuccess({
        razorpay_payment_id: params.get("razorpay_payment_id") || "",
        razorpay_order_id: params.get("razorpay_order_id") || "",
        razorpay_signature: params.get("razorpay_signature") || "",
      });
    } else {
      onFailure(new Error(params.get("error") || "Payment failed"));
    }
  });

  browserFinishedListener = await Browser.addListener("browserFinished", async () => {
    if (settled) return;
    settled = true;
    appUrlListener?.remove();
    browserFinishedListener?.remove();
    onFailure(new Error("Payment cancelled by user"));
  });

  await Browser.open({ url });
};

export const initiateRazorpayPayment = async (options: RazorpayPaymentOptions) => {
  if (Capacitor.isNativePlatform()) {
    return initiateRazorpayPaymentNative(options);
  }
  return openRazorpayCheckout(options);
};
