# Recover the ₹1,290 payment and stop orders being lost after payment

## What the records show

The Razorpay receipt is real and the money is collected: ₹1,290, payment id `pay_TV7np26vrodeDX`, from `elegantanoop@gmail.com` / +91 9844798807, today at 2:02 PM IST.

There is no order for it in the database:
- The only order for 9844798807 is from 24 Aug. Nothing today.
- No invoice was created today for this payment (the only one today is Ramesh PK's ₹3,999 registration).
- The cart for Anoop A (9844798807) still holds 6 × Banana Chips and 6 × Sharkara Varatty, which comes to exactly ₹1,290 at listed prices — the cart was never cleared because the order was never created.
- The backend log shows the order request arriving today at 12:54 UTC and being rejected because it carried no payment reference (`payment_method: "razorpay", has_payment_reference: false`).

So: payment succeeded on Razorpay, but the app's follow-up call to create the order did not carry the payment id, the backend refused it, and the customer's money has no order behind it. The current site code does pass the payment id, so this call came from an older published/app build still in use on that phone.

## Fix

1. **Create the missing order manually** for Anoop A: 6 × Banana Chips + 6 × Sharkara Varatty, total ₹1,290, marked paid with reference `pay_TV7np26vrodeDX`, delivery to his saved address, status confirmed so it enters the normal dispatch flow. Generate its GST invoice and clear his cart.
2. **Never lose a paid order again — record the payment before the order.** On successful Razorpay payment, the app first records the payment attempt server-side (payment id, amount, customer, cart contents), then creates the order. If order creation fails for any reason, the attempt stays on record and can be turned into an order.
3. **Reconcile from Razorpay's payment id.** When an order request comes in without a payment reference, the backend looks up the pending attempt for that customer instead of rejecting outright, and creates the order from it.
4. **Admin recovery screen.** A "Paid, no order" list in the admin dashboard showing recorded payments with no matching order, with a one-click button to create the order — so staff can fix such cases without developer help.
5. **Force old clients to update.** Add a minimum-app-version check so out-of-date builds prompt for an update before checkout, rather than silently sending incomplete requests.

## Verification

- The ₹1,290 order shows in the admin order list and in Anoop's order history, paid, with an invoice.
- His cart is empty.
- A test checkout produces both a payment record and an order, and the "Paid, no order" list stays empty.
- Simulating an order-creation failure after payment leaves an entry in that list that can be converted to an order in one click.

## Technical notes

- New table `payment_attempts` (payment id, razorpay order id, user/guest details, amount, cart snapshot, status, linked order id) with RLS: owners read their own, admins read all, writes only from edge functions.
- `src/utils/razorpay.ts` / `GuestCheckout.tsx` / `Checkout.tsx`: record the attempt in the `onSuccess` handler before invoking order creation.
- `supabase/functions/place-guest-order/index.ts`: fall back to the recorded attempt when `payment_reference` is absent; keep the current rejection only when no attempt matches.
- Manual recovery of today's order done through a data statement, not schema migration.
