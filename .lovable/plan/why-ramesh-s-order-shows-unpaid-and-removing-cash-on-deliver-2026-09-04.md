# Why Ramesh's order shows unpaid, and removing Cash on Delivery

## What actually happened

Ramesh's order today (ELA20260904-18816, Rs. 656) was placed as **Cash on Delivery**. Nothing was charged and nothing was taken from his wallet, which is why the wallet still reads zero and the order shows payment pending — the money is meant to be collected by the delivery person at the door. His earlier Rs. 3,600 order (24 August) was also cash on delivery, and it was marked paid after delivery.

So this is not a bug or a loophole: cash on delivery is currently offered as a payment choice at checkout.

## What will change

Cash on delivery is removed completely. Every order must be paid before it is confirmed — online payment, or wallet credit when the balance covers the order (or a mix of wallet plus online for the rest).

1. **Checkout**: the "Cash on Delivery" option is removed; online payment is the only choice and is pre-selected. Wallet credit continues to be applied first as it does today.
2. **Backend rule**: the order-placing routine rejects any cash-on-delivery request, so older app versions still on customers' phones cannot slip a cash order through.
3. **Existing cash orders**: Ramesh's Rs. 656 order and any other open cash orders are left untouched — the plan does not cancel or alter them. If you want them handled (cancelled, or a payment link sent), say so and it will be added.
4. **Delivery app and admin**: cash-collection prompts stay in place for the orders already out for delivery, since those still need collecting; they simply stop appearing for new orders.

## Technical notes

- `src/pages/Checkout.tsx`: drop the `cod` option from the payment selector, default `paymentMethod` to `online`, keep the wallet-first logic and the Razorpay step.
- `place_order_atomic`: restrict `p_payment_method` to `online`, and never set `is_cod` / `cod_amount` on new orders. Fully wallet-covered orders continue to complete without a gateway step.
- Guest checkout already requires a verified gateway payment — no change needed there.
- No schema change: the `is_cod`, `cod_amount`, `cod_collected` columns stay for historical orders and the driver/admin screens that read them.
