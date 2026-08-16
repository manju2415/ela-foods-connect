# Wallet-paid orders, ₹0 totals, and Add to Cart on listings

## What's wrong (verified in the database and code)

1. **Wallet is never actually charged.** Checkout calculates how much wallet credit to apply, stores it on the order (`wallet_amount_used`), and reduces the payable total — but it never debits the wallet or writes a wallet transaction. There are zero `purchase`-type wallet transactions in the database, so no order has ever deducted balance.
2. **Fully wallet-paid orders show "pending payment".** When wallet credit covers the whole amount, the order is created with `total_amount = 0`, flagged as Cash on Delivery, and payment status left `pending`. Confirmed orders: ELA74685194 (subtotal ₹1205, wallet ₹1205, total ₹0, pending) and ELA96571280 (subtotal ₹590, wallet ₹590, total ₹0, pending).
3. **Screenshot total analysis.** The invoice showing items summing to ₹1205 with "Total ₹0.00" is order ELA74685194. It is not a calculation bug in the invoice — the order's stored `total_amount` genuinely is ₹0 because ₹1205 of wallet credit was applied. The invoice just doesn't show the wallet credit line, so it reads as if items vanished.
4. **Add to Cart on listing pages.** The product card already has Cart / Buy Now buttons, but they are hidden and only slide in on mouse hover — so on phones and tablets they are unreachable, and users must open the product page.

## The fix

### A. Charge the wallet properly (backend)
Add a database function `pay_order_with_wallet(order_id, amount)` that, in one atomic step:
- verifies the order belongs to the caller and hasn't already been charged,
- spends purchase-only balance first, then withdrawable balance,
- rejects the payment if the balance is insufficient,
- writes a `purchase` wallet transaction with the order reference and the new balance,
- marks the order `payment_status = completed` and clears the COD flags when the wallet covers the full amount (partial wallet payments keep the remaining amount as COD/online).

Checkout calls this right after the order row is created, before the Razorpay step. If the wallet charge fails, the order is cancelled and the user is told, instead of a silently free order.

### B. Correct order state for wallet-covered orders
- Fully wallet-paid orders: `payment_status = completed`, not COD, `cod_amount = 0`.
- Partially wallet-paid orders: remaining amount goes to Razorpay or COD as it does today.

### C. Backfill the two existing orders
For ELA74685194 and ELA96571280: deduct the wallet amounts that should have been taken (or, if the balance is no longer there, leave the balance alone and just mark the orders paid) and set their payment status to completed. Which of the two we do is the open question below.

### D. Show wallet credit on the invoice/order summary
Add a "Paid from wallet" line so a ₹0 total reads correctly instead of looking like a broken calculation.

### E. Always-visible Add to Cart on listings
Move the Cart and Buy Now buttons out of the hover overlay into the card body so they are always visible on every device (home, category, search, products pages all use the same card). Behaviour stays the same: products with pack variants still open the detail page to choose a pack; out-of-stock stays disabled.

## Technical notes
- New migration: `pay_order_with_wallet` security-definer function + a one-off data fix for the two orders.
- `src/pages/Checkout.tsx`: call the RPC after order insert, handle failure, keep the existing purchase-only-first priority.
- `src/components/ProductCard.tsx`: relocate the action buttons; no pricing or business-logic changes.
- Order detail / invoice view: add the wallet line to the totals block.

## Backfill decision
For the two already-placed ₹0 orders, the wallet balances will be deducted now (₹1205 from Shyju for ELA74685194, ₹590 from Sanith for ELA96571280), with matching `purchase` wallet transactions recorded and both orders marked paid.
