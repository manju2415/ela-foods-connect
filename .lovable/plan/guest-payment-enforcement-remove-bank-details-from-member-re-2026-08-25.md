# Guest payment enforcement + remove bank details from member registration

## 1. Guest checkout must be paid online (no Cash on Delivery)

Today the guest checkout page defaults to "Cash on Delivery" and, when that is selected, the order is created straight away without any payment — that is why guest orders appear captured automatically.

Change:
- Remove Cash on Delivery from the guest payment options; keep UPI and Card (both go through Razorpay). Default selection becomes UPI.
- The guest order is only created after Razorpay confirms and verifies the payment. If payment is cancelled or fails, no order is created and the user stays on the payment step with a clear message.
- The created guest order is marked as paid online (payment status completed, COD flags off) instead of pending/COD.
- Button always reads "Pay ₹<amount>".

Note: signed-in customer checkout is untouched — this change applies to the guest flow only. Say the word if COD should be removed there too.

## 2. Stop asking members for bank account details at registration

Bank details move out of registration entirely and are only collected later, when a member actually requests a withdrawal (that screen already has the bank form with IFSC verification).

Changes:
- Complete Registration form: remove the Bank Details section (bank name, IFSC, account number, account holder) and its validation. The form then collects only name/phone/address-level profile info.
- Onboarding checks stop treating "no bank account" as an incomplete profile. Members are no longer redirected to complete-registration just because bank details are missing — this affects the login redirect, the customer app gate, the global onboarding gate, and the shared onboarding hook. Registration payment gating is unchanged.
- Withdrawal screen keeps requiring bank details before a payout request, so payouts stay safe.
- Existing saved bank details are left as-is in the database; nothing is deleted.

## Technical notes
- `src/pages/GuestCheckout.tsx`: drop the `cod` option, default `paymentMethod` to `upi`, gate order placement behind `initiateRazorpayPayment` success in all cases.
- `supabase/functions/place-guest-order/index.ts`: accept online payment reference, set `payment_status: "completed"`, `is_cod: false`, `cod_amount: 0` for online orders.
- `src/pages/CompleteRegistration.tsx`: remove bank fields from the zod schema, defaults, profile update payload, and the bank UI block (`IfscInput` usage there).
- Drop `bank_account_number` from the completeness checks in `src/hooks/useOnboardingStatus.ts`, `src/components/OnboardingGate.tsx`, `src/pages/Auth.tsx`, `src/pages/CustomerApp.tsx`.
- `src/components/dashboard/WithdrawalSection.tsx` unchanged.
