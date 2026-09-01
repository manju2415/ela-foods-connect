# Wallet not debited on some orders — source of the bug and proposed fix

## Where the bug comes from

Not the dev/preview site, and not the current live code. It comes from **old app/browser builds still running the pre-16-August checkout** on real customer devices.

Evidence:

- Order `ELA53325067` (Meena, invoice INV20260831-000018) has **no `idempotency_key`**, a legacy `ELA<8-digit>` order number, `is_cod = true` while `cod_amount = 0` and `total_amount = 0`, and **no wallet transaction**.
- Every order placed through today's code (`ELA20260xxx-xxxxx` numbers) has an idempotency key and exactly one matching `purchase` wallet transaction.
- Today's checkout (`src/pages/Checkout.tsx`) only calls the `place_order_atomic` database function, which debits the wallet, writes the transaction, and never marks a ₹0 order as COD.
- The old build inserted the order row straight from the browser. The `orders` table allows that (`INSERT` policy: `auth.uid() = user_id`), but the `wallets` table has **no update policy for users** — so an old client can create an order claiming `wallet_amount_used` while being physically unable to debit the wallet. That is exactly the mismatch seen on the invoice.

Meena's wallet was later corrected by hand: a single "Admin adjustment: purchase" debit of ₹855 on 31 Aug at 10:43 UTC (balance 3001 → 2146). The order itself never touched it.

Only two orders since 17 August show this signature:

| Order | Date | Member | Wallet claimed | Debited by order | Corrected |
|---|---|---|---|---|---|
| ELA46411284 | 24 Aug | Sudevan P M | Rs. 3000 | no | to be verified |
| ELA53325067 | 31 Aug | Meena | Rs. 855 | no | yes, manual admin adjustment |

The invoice's "payment method: cod" is a second, cosmetic symptom: the invoice function derives the method from the order's `is_cod` flag, which the old build set incorrectly.

## Proposed fix

1. **Close the hole in the database.** Restrict direct client inserts into `orders` so a row cannot be created with `wallet_amount_used > 0` outside `place_order_atomic`. Any order that claims wallet payment must go through the function that actually debits the wallet.
2. **Force stale clients to update.** Reject legacy checkout writes with a clear "please update the app" message, and make the web/PWA update prompt more aggressive so old bundles cannot keep transacting.
3. **Correct the invoice payment label.** When an order is fully covered by wallet credit, the invoice should read "wallet", not "cod".
4. **Reconcile the two legacy orders.** Verify Sudevan's Rs. 3000 (check whether it was ever deducted) and record a proper wallet transaction for Meena's Rs. 855 so the ledger links to the order instead of showing an unexplained admin adjustment.
5. **Add an admin check.** A small report listing orders whose `wallet_amount_used` has no matching wallet transaction, so this can never go unnoticed again.

## Technical notes

- Migration: trigger or policy on `public.orders` blocking direct inserts with `wallet_amount_used > 0`; keep `place_order_atomic` (SECURITY DEFINER) as the only path.
- `issue_order_invoice`: change the payment-method expression so a fully wallet-covered order reports `wallet` even when `is_cod` is set.
- Data fix via SQL for the two orders (no schema change).
- Client: version/stale-build guard around checkout plus the existing PWA update flow.
