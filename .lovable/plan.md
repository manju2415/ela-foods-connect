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

### 3. Remove the referral code field from the login/signup page
Delete the "Referral Code *" input, its validation, the green/red state, and the submit button lock on the signup tab of `/auth`. Signup will need only full name + mobile number. If a referral code is present in the URL (`?ref=CODE`), it is still applied silently in the background so existing invite links keep crediting the referrer.

## Technical notes

- `src/pages/Auth.tsx`: drop `referralCode` from the zod schema, remove `validateReferralCode`, `referralCodeValid`, `checkingCode`, the field markup (lines ~493-506) and the disabled condition on the submit button; keep passing an optional referral code from the URL into `signup-create-user`.
- `src/pages/CompleteRegistration.tsx`: after a successful save, navigate to `/registration-payment` instead of the dashboard when `registration_fee_paid` is 0.
- `src/pages/RegistrationPayment.tsx`: unchanged logic, already founder-aware.
- New `src/pages/FounderSignup.tsx` + route in `src/App.tsx`, reusing the OTP components from `Auth.tsx`; it sets founder intent so the payment page picks the Rs 4,999 fee.
- Founder status stays server-verified in `process-registration-payment`; the new route cannot be used to self-promote to founder — an admin still confirms the founder role.
