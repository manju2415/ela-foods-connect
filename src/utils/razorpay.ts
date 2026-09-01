import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapacitorApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { realEmailOrEmpty } from "@/lib/email";


declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface PaymentAttemptContext {
  purpose?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items?: Array<{ product_id: string; quantity: number; variant_id?: string | null }>;
  guest_details?: Record<string, unknown> | null;
  coupon_code?: string | null;
  discount_amount?: number;
}

interface RazorpayPaymentOptions {
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
  onSuccess: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  onFailure: (error: any) => void;
}

// Live website URL, used only when running in the native app: Razorpay's UPI
// app-detection (Google Pay, PhonePe, ...) doesn't work inside the app's own
// embedded WebView, only in a real browser context, so native builds open
// checkout in an in-app browser tab against this page instead.
const PAYMENT_BRIDGE_URL = "https://elabazar.com/payment-bridge";
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
    script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.head.appendChild(script);
  });
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
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error("Razorpay SDK failed to initialize. Please refresh and try again.");
  }

  // Only send real customer emails to Razorpay (never internal placeholders)
  const customerEmail = realEmailOrEmpty(options.prefill?.email);

  // Step 1: Create Razorpay order via edge function
  const { data, error } = await supabase.functions.invoke("razorpay-create-order", {
    body: {
      amount: options.amount,
      receipt: options.receipt || `rcpt_${Date.now()}`,
      notes: { ...(options.notes || {}), ...(customerEmail ? { email: customerEmail } : {}) },
    },
  });

  if (error || !data?.order_id) {
    throw new Error(data?.error || "Failed to create payment order");
  }

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
    handler: async (response: any) => {
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
          options.onFailure(new Error("Payment verification failed"));
          return;
        }

        options.onSuccess(response);
      } catch (err) {
        options.onFailure(err);
      }
    },
    modal: {
      ondismiss: () => {
        options.onFailure(new Error("Payment cancelled by user"));
      },
    },
  };

  const rzp = new window.Razorpay(rzpOptions);
  rzp.on("payment.failed", (response: any) => {
    options.onFailure(response.error);
  });
  rzp.open();
};

const encodeBridgePayload = (value: unknown): string =>
  encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(value)))));

/**
 * Native-only path: hands the payment off to a real browser tab (Chrome
 * Custom Tabs) pointed at the live site's /payment-bridge page, which runs
 * openRazorpayCheckout in a context where Razorpay can actually detect UPI
 * apps. The bridge redirects to a custom-scheme deep link with the result,
 * which we catch here and translate back into the normal onSuccess/onFailure
 * callbacks, so callers don't need to know which path was taken.
 */
const initiateRazorpayPaymentNative = async (options: RazorpayPaymentOptions) => {
  const { onSuccess, onFailure, ...serializable } = options;
  const payloadParam = encodeBridgePayload(serializable);
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
