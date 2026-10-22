import { useEffect, useState } from "react";
import { openRazorpayCheckout, type RazorpayPaymentOptions } from "@/utils/razorpay";
import { decodeBridgePayload, isPreparedOrder } from "@/utils/paymentBridge";

const CALLBACK_SCHEME = "elabazarpay://payment-callback";

type BridgePayload = Omit<RazorpayPaymentOptions, "onSuccess" | "onFailure">;

const redirectToApp = (params: Record<string, string>) => {
  window.location.href = `${CALLBACK_SCHEME}?${new URLSearchParams(params).toString()}`;
};

// Opened in an in-app browser tab (not the app's own WebView) so Razorpay's
// UPI app detection works, then hands the result back to the app via a
// custom-scheme deep link. See src/utils/razorpay.ts for the native-side half.
const PaymentBridge = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const encoded = new URLSearchParams(window.location.search).get("payload");
      if (!encoded) {
        setError("Missing payment details.");
        return;
      }

      let payload: BridgePayload;
      try {
        payload = decodeBridgePayload<BridgePayload>(encoded);
      } catch {
        setError("Invalid payment details.");
        return;
      }

      // This tab has no Supabase session, so the app creates the Razorpay
      // order itself and passes it in. Member orders can't be created from
      // here at all — an app build from before that change gets a clear
      // message instead of a sign-in error.
      if (payload.preparedOrder !== undefined && !isPreparedOrder(payload.preparedOrder)) {
        setError("Invalid payment details.");
        return;
      }
      if (!payload.preparedOrder && payload.purpose === "member_order") {
        redirectToApp({ status: "failed", error: "Please update the Ela Bazar app to pay online." });
        return;
      }

      try {
        await openRazorpayCheckout({
          ...payload,
          onSuccess: (response) => redirectToApp({ status: "success", ...response }),
          onFailure: (err) => redirectToApp({ status: "failed", error: err?.message || "Payment failed" }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Payment failed";
        redirectToApp({ status: "failed", error: message });
      }
    };

    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
      {error ? (
        <div className="space-y-2 max-w-sm">
          <p className="font-medium text-destructive">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">You can close this tab and try again in the app.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Opening secure payment…</p>
        </div>
      )}
    </div>
  );
};

export default PaymentBridge;
