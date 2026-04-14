import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    Razorpay: any;
  }
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
  onSuccess: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  onFailure: (error: any) => void;
}

const formatRazorpayContact = (contact?: string) => {
  const digits = (contact || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const initiateRazorpayPayment = async (options: RazorpayPaymentOptions) => {
  // Step 1: Create Razorpay order via edge function
  const { data, error } = await supabase.functions.invoke("razorpay-create-order", {
    body: {
      amount: options.amount,
      receipt: options.receipt || `rcpt_${Date.now()}`,
      notes: options.notes || {},
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
      email: options.prefill?.email || "",
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
