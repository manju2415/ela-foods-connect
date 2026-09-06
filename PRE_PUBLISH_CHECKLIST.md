# Pre-publish checklist

Run through this against the live site before publishing any change through
Lovable. It exists because the flows below are the ones that have regressed
repeatedly — a change to one has broken another more than once.

## 1. Login by phone
- [ ] Log in with an existing member account (OTP or test phone).
- [ ] Log in with a phone that first ordered as a **guest** — this is the
      case that silently breaks when the guest-account repair in
      `verify-otp-login` isn't wired up.

## 2. Place and pay for an order
- [ ] Place an order as a **logged-in member**, pay online, confirm it
      reaches "confirmed"/"completed" with no error shown.
- [ ] Place an order as a **guest**, pay online, confirm the confirmation
      page shows an order number (not "payment went through but the order
      could not be created").

## 3. Stock count after the sale
- [ ] Note a product's stock before the order, place the order, confirm
      stock dropped by exactly the quantity ordered — not zero, not double.
- [ ] Check the same for a **guest** order specifically (this is the path
      most likely to be quietly broken — it depends on
      `deduct_paid_order_stock`, which has gone missing from the live
      database before without any error surfacing to a developer).

## 4. Wallet credit
- [ ] Place an order paid partly/fully by wallet balance; confirm the
      wallet balance decreases by the amount used, exactly once.
- [ ] If the change touches referrals or commissions, confirm a referral
      bonus or purchase commission is credited exactly once per order, not
      once per status change.

## 5. Invoice / confirmation
- [ ] Confirm the order-confirmation email is actually delivered (check the
      inbox, not just the function's return value) — a "success" response
      is not proof of delivery; check `send-order-confirmation`'s own logs
      for a provider-side rejection.

## 6. Migrations
- [ ] Before adding a migration, check whether it's actually needed against
      the **live** schema (not just "does this file exist in the repo") —
      use the project's PostgREST endpoint to probe for the
      table/column/function before assuming it's missing or already there.
- [ ] Never leave a migration file sitting in the repo unpublished for more
      than a day or two. An unapplied migration that assumes a different
      starting schema than what's actually live is exactly what causes a
      later, unrelated change to silently reintroduce a bug that was
      already fixed (or a fix that was never actually live).
