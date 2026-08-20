# Invoices, MLM toggle, coupon rules, admin wallets, contact picker

## 1. Invoice: print + PDF download

Today the invoice opens in a new browser window (`window.open`), which is blocked inside the Android app and by pop-up blockers, and there is no real PDF file — only the browser print dialog.

- Replace the pop-up with an in-app invoice preview dialog (same GST invoice layout: company header, bill-to, item table with HSN and GST, totals).
- Two buttons in the dialog: **Print** (prints just the invoice via a hidden frame) and **Download PDF** (generates a real `.pdf` file named after the invoice number, works in the app and on desktop).
- Available everywhere the Invoice button already appears: customer order details, admin orders, registration payments.

## 2. MLM settings: enable/disable purchase commission

The purchase-commission setting currently only stores a percentage, with no on/off switch (unlike founder purchase commission, which has one).

- Add an **Enable purchase commission** switch above the percentage field in MLM Settings.
- Store it on the existing `purchase_commission_rate` setting and honour it in the commission payout function: when disabled, no commission is credited on associate purchases.
- Existing behaviour stays enabled by default so nothing changes until the admin turns it off.

## 3. Coupons: who and when a coupon applies

Add two configurable rules per coupon in the admin coupon form:

- **Order scope**: First order only / All orders.
- **Audience**: All customers / Members only / Non-members only.

Both are enforced at checkout — the coupon box rejects a coupon that doesn't match the shopper, and the order-placement function re-checks server-side so it cannot be bypassed. The coupon list shows both rules as badges. Existing coupons default to "All orders" + "All customers".

## 4. Admin view of every user's wallet

- Add **Wallet balance** to the admin Users list (total, with withdrawable and purchase-only shown underneath), searchable and sortable, and shown on the mobile cards too.
- Clicking it opens the existing wallet dialog, extended with a **transaction history** list (date, type, amount, description) so admins can see how a balance was built up, alongside the current adjust controls.

## 5. Contact picker in the Android app

The app currently reads the whole address book, which needs the `READ_CONTACTS` permission; if the permission is missing or denied in the build, the picker fails and shows an error.

- Try the operating-system contact picker first (Android's own picker sheet), which returns one contact without needing the contacts permission. This is the path most likely to work in the current APK.
- Fall back to the in-app searchable list (full address book) only when the OS picker isn't available, and keep manual entry always usable.
- Clearer messaging when permission is denied, plus a "Try again" action.
- Document the `READ_CONTACTS` permission line needed in the Android project for the full-list mode.

## Technical notes

- Invoice: new `InvoiceDialog` component + `jspdf` for the download; `InvoiceButton` opens it instead of `window.open`.
- MLM: `mlm_settings.purchase_commission_rate` gains `enabled`; `credit_purchase_commission()` returns false when disabled (migration).
- Coupons: migration adds `first_order_only boolean` and `audience text` ('all' | 'members' | 'non_members') to `coupons`, with validation added to `place_order_atomic()` (checks prior order count and the user's `user_level`/member role) and mirrored in `Checkout.tsx`.
- Wallets: admin Users query joins `wallets`; `WalletAdjustDialog` also loads `wallet_transactions` for the selected user. Admin read access to wallets/transactions is verified before shipping.
- Contacts: `src/lib/contacts.ts` gains a `pickContactNative()` using the plugin's OS picker, with the existing `loadDeviceContacts()` list as fallback.
