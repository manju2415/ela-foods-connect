# Fixes: featured products, add-user, registration & founder status

## 1. Featured products — show 10, scrollable

Home page currently fetches only 4 featured products in a fixed grid. Change to fetch 10 and render them in a horizontal, swipeable carousel (arrows on desktop, swipe on mobile), keeping the existing product card design.

## 2. Invite Friends & Family screen

- **Pick from phone contacts**: add a "Pick from contacts" button next to the mobile number field. In the installed mobile app it opens the native contact picker (Capacitor contacts plugin); on supported browsers it uses the built-in contact picker; where neither is available the button is hidden. The selected name and number auto-fill the form (number cleaned to 10 digits).
- **Stray default number**: the form starts empty, so the number appearing is browser/keyboard autofill. Disable autofill on the name and mobile fields and clear the fields every time the dialog opens.

## 3. Bank details — IFSC verification

On the bank details form (member dashboard withdrawal section and the complete-registration page), validate the IFSC format (4 letters + 0 + 6 alphanumerics) and verify it against the public Razorpay IFSC lookup. On success show the bank name and branch and auto-fill the bank name; on failure block saving with a clear message.

## 4/5. "Payment pending" for a member who already paid

Verified in the database: Shyju (9448493280) has the ₹4,999 registration fee recorded and bank details saved, but the account still has `user_level = associate` and `founder_status = none`. The payment routine only promotes `founder_status` when the account is already flagged as a founder, so accounts approved as founding members outside that flow stay marked pending.

Fix:

- Update the payment routine so any account with the founding-member role is promoted to founder level and active status on successful payment.
- One-time data correction for accounts that already paid: set founder level/active status where the fee is recorded.
- Admin screens: show status derived from the actual paid amount rather than only `founder_status`, and add a manual "Mark as paid / Activate" action for admins to handle offline payments.

## 6. Wrong mobile number pre-filled on the registration screen

The complete-registration form pre-fills the phone from any saved default address rather than the logged-in account. Change it to always pre-fill the logged-in account's own phone number (from the profile) and make it read-only, so another person's number can never appear.

## 7/9. Founder not getting the "complete registration" prompt

Verified: Sudevan P M (9845121558) has no bank details and no fee recorded, so he should be routed to complete registration. The routing check exists on the login path only; if a founder lands on the site with an existing session (app reopen, deep link, bookmark) no gate runs on most pages.

Fix: apply the onboarding gate centrally so any signed-in member/founder without bank details goes to complete-registration, and without payment goes to the payment page — regardless of entry point. Admins and delivery partners stay exempt.

## 8. User agreement at registration

Add the supplied User Agreement text as a policy page (`/user-agreement`), linked in the footer. On the signup and complete-registration screens add a required checkbox: "I have read and agree to the User Agreement", with the full text available in a scrollable dialog. Registration cannot be submitted unless it is ticked, and acceptance (timestamp) is recorded on the profile.

## 10/11. Level shows Associate while status is Founder

Same root cause as items 4/5 — the level was never promoted after payment. The correction above sets founder level, after which the dashboard shows Founder consistently.

## 11b. Founder withdrawals showing as "Purchase only"

Verified in MLM settings: referral bonus (first 10 and beyond 10) and founder level commissions are all configured with withdrawable turned off, so every credit lands in the purchase-only wallet — the app is behaving as configured. No code change needed; in Network Admin > MLM Settings turn on "withdrawable" for the bonus types founders should be able to withdraw. Optionally we also add a one-time correction to move already-credited amounts for those bonus types into the withdrawable balance — confirm if you want that.

## Technical notes

- `src/components/FeaturedProducts.tsx`: limit 10, embla carousel (`@/components/ui/carousel`).
- `src/components/AddUserDialog.tsx`: contact picker + `autoComplete="off"` + reset on open.
- `src/components/dashboard/WithdrawalSection.tsx`, `src/pages/CompleteRegistration.tsx`: IFSC validation/lookup (`https://ifsc.razorpay.com/<code>`).
- `supabase/functions/process-registration-payment/index.ts`: promote on founding-member role; migration to backfill paid founders.
- `src/pages/CompleteRegistration.tsx`: phone from profile, read-only.
- New `AuthGuard`-level onboarding gate reusing `useOnboardingStatus`.
- New `src/pages/UserAgreement.tsx` + `accepted_agreement_at` column on `profiles`.
