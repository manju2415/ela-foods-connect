# Payments on signup + remove referral code from login page

## Where payment happens today

Payment already exists, but only after login, not during signup:

- `/registration-payment` is the Razorpay page. Founders see Rs 4,999 (from the `founder_registration_fee` setting) with no "Skip for now" button; members see Rs 2,499.
- The redirect gate in `Auth.tsx` sends any non-admin user to `/complete-registration` (profile + bank details), then to `/registration-payment`, before letting them reach a dashboard.
- Brand-new signups are sent to `/complete-registration` only — they are not explicitly pushed to the payment step in that same flow, so the payment screen can be missed until the next login.

## What to change

### 1. Signup always ends at payment
After a new user finishes `/complete-registration`, route them straight to `/registration-payment` and show the correct amount for their type (founder Rs 4,999 / member Rs 2,499). Nobody reaches a dashboard with an unpaid registration.

### 2. Founder signup route shows the founder payment
Add a dedicated founder signup entry (`/founder-signup`) that uses the same mobile + OTP flow, marks the account as a founder candidate, and then goes profile details -> Rs 4,999 Razorpay payment, no skip option.

### 3. Referral code stays, but optional — on signup and at payment
Keep the referral code field on the signup form, but make it optional so nobody is blocked from creating an account: the submit button no longer locks when the field is empty, and the code is only checked when something is typed (green tick for valid, red note for invalid). Prefill it automatically from an invite link (`?ref=CODE`).

Also show a referral code box on the registration payment page (founder Rs 4,999 and member Rs 2,499), so anyone who missed it at signup can still enter their referrer's code right before paying. It is validated the same way and applied when the payment succeeds.

## Technical notes

- `src/pages/Auth.tsx`: make `referralCode` optional in the zod schema, keep `validateReferralCode` but only run it on non-empty input, remove the `referralCodeValid !== true` lock on the submit button, and drop the pre-submit blocking toast; prefill from the `ref` query param.
- `src/pages/CompleteRegistration.tsx`: after a successful save, navigate to `/registration-payment` instead of the dashboard when `registration_fee_paid` is 0.
- `src/pages/RegistrationPayment.tsx`: add an optional referral code input with the same `referral_codes` lookup; pass the validated code to `process-registration-payment`, which calls `process_mlm_referral` on success only when the user has no `referred_by` yet (the function is already idempotent).
- New `src/pages/FounderSignup.tsx` + route in `src/App.tsx`, reusing the OTP components from `Auth.tsx`; it sets founder intent so the payment page picks the Rs 4,999 fee.

- Founder status stays server-verified in `process-registration-payment`; the new route cannot be used to self-promote to founder — an admin still confirms the founder role.
