# Collect real email addresses at Razorpay payment

## Problem

Members sign in with a mobile number, and their account email is an internal placeholder
(`<phone>@elabazar.local`). That placeholder is what currently gets passed to Razorpay as the
prefill email, so Razorpay receipts and payment records have no usable customer email.

## What will change

A small "Email address" field is added to the payment steps, so a real email is captured before
Razorpay opens, saved to the member's profile, and sent to Razorpay.

### 1. Registration / founder payment page
- Show an email input above the Pay button.
- Pre-fill it from the profile email when it's a real address; leave blank when it's the
  `@elabazar.local` placeholder.
- Require a valid email before the Pay button proceeds.
- Save the entered email to the member's profile, then pass it to Razorpay as prefill.

### 2. Store checkout (logged-in members)
- Same treatment: an email field in the payment section, required for online payment
  (not required for cash on delivery).
- Saved to the profile so returning members don't have to re-enter it.

### 3. Guest checkout
- Already collects a real email — no change needed beyond confirming it is passed through.

### 4. Razorpay layer
- Never send a `@elabazar.local` address to Razorpay; send an empty value instead of a fake one
  if no real email is available.
- Include the email in the Razorpay order notes so it appears against the payment in the
  Razorpay dashboard.

## Technical notes

- Files touched: `src/pages/RegistrationPayment.tsx`, `src/pages/Checkout.tsx`,
  `src/utils/razorpay.ts` (placeholder filter + notes), and a small shared email-validation helper.
- Email persisted to `profiles.email` (existing column) via a Supabase update; the auth account
  email stays unchanged so mobile login keeps working exactly as it does today.
- Validation with a zod schema: trimmed, valid email format, max 255 chars.
- No schema migration required.

## Out of scope

- Changing the mobile-number login flow or the internal auth email format.
- Email verification / confirmation emails.
