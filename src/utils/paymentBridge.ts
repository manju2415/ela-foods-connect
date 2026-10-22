// Pure helpers for the Razorpay payment path — no Capacitor/Supabase imports,
// so they can be unit-tested directly (supabase/functions/_tests).

/** A Razorpay order already created server-side by razorpay-create-order. */
export interface PreparedRazorpayOrder {
  order_id: string;
  amount: number; // paise, as returned by Razorpay
  currency: string;
  key_id: string;
}

export type PaymentErrorKind = "auth" | "network" | "order" | "checkout";

/**
 * Error with a customer-safe message plus a kind, so callers (and support)
 * can tell a sign-in problem from a network drop or a Razorpay failure.
 */
export class PaymentError extends Error {
  kind: PaymentErrorKind;
  code?: string;
  constructor(kind: PaymentErrorKind, message: string, code?: string) {
    super(message);
    this.name = "PaymentError";
    this.kind = kind;
    this.code = code;
  }
}

const AUTH_MESSAGE = "Your session has expired. Please sign in again and retry the payment.";
const NETWORK_MESSAGE = "Could not reach the payment server. Check your internet connection and try again.";
const ORDER_MESSAGE = "Could not start the payment. Please try again.";

// Only short, plain messages written by our own edge functions are shown;
// anything that looks like a stack trace or internal detail is replaced.
const safeServerMessage = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 200) return null;
  if (/\n|\bat\s+\S+\s*\(|stack|exception|syntaxerror|typeerror|postgres|sql|jwt|token|secret|key_secret|service_role/i.test(text)) return null;
  return text;
};

const readErrorBody = async (error: unknown): Promise<Record<string, unknown> | null> => {
  const ctx = (error as { context?: { clone?: () => Response; json?: () => Promise<unknown>; text?: () => Promise<string> } })?.context;
  if (!ctx) return null;
  try {
    const res = typeof ctx.clone === "function" ? ctx.clone() : ctx;
    const raw = typeof res.text === "function" ? await res.text() : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Turns the { data, error } of supabase.functions.invoke("razorpay-create-order")
 * into a PaymentError. On a non-2xx response supabase-js leaves `data` null and
 * puts the response in `error.context`, so the body must be read from there.
 */
export const paymentErrorFromInvoke = async (error: unknown, data: unknown): Promise<PaymentError> => {
  const name = (error as { name?: string })?.name;
  if (name === "FunctionsFetchError") return new PaymentError("network", NETWORK_MESSAGE);

  const status = (error as { context?: { status?: number } })?.context?.status;
  const body = (await readErrorBody(error)) ?? (data && typeof data === "object" ? (data as Record<string, unknown>) : null);
  const code = typeof body?.code === "string" ? body.code : undefined;

  if (status === 401 || code === "AUTH_REQUIRED") return new PaymentError("auth", AUTH_MESSAGE, code ?? "AUTH_REQUIRED");
  if (name === "FunctionsRelayError") return new PaymentError("network", NETWORK_MESSAGE);
  return new PaymentError("order", safeServerMessage(body?.error) ?? ORDER_MESSAGE, code);
};

export const isPreparedOrder = (value: unknown): value is PreparedRazorpayOrder => {
  const v = value as Partial<PreparedRazorpayOrder> | null;
  return !!v && typeof v.order_id === "string" && /^order_[A-Za-z0-9]+$/.test(v.order_id)
    && typeof v.key_id === "string" && /^rzp_(live|test)_[A-Za-z0-9]+$/.test(v.key_id)
    && typeof v.amount === "number" && v.amount > 0 && typeof v.currency === "string";
};

/**
 * What the native app puts in the /payment-bridge URL. The Razorpay order is
 * created by the app itself (where the customer is signed in), so the bridge
 * never needs — and the URL never carries — any auth token. For member orders
 * the server already holds the full checkout against that Razorpay order, so
 * the cart and address are left out of the URL entirely.
 */
export const buildBridgePayload = <T extends { purpose?: string; attemptContext?: unknown }>(
  options: T,
  preparedOrder: PreparedRazorpayOrder,
) => {
  const { attemptContext, ...rest } = options;
  return {
    ...rest,
    ...(options.purpose === "member_order" ? {} : { attemptContext }),
    preparedOrder,
  };
};

export const encodeBridgePayload = (value: unknown): string =>
  encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(value)))));

export const decodeBridgePayload = <T>(value: string): T =>
  JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(value)))));
