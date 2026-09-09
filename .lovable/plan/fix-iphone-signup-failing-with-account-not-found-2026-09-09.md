# Fix iPhone signup failing with "Account not found"

## What the evidence shows so far

For the number 9742586326 (Shyla), checked directly in the live database:

- The account was created at 08:48:30 today, email confirmed at 08:48:30, wallet created, referrer assigned — on **Android**.
- A successful sign-in for the same account happened at 08:50:07, about 90 seconds later — also on **Android**.
- Separately, an iPhone signup attempt for this number failed with "Account not found. Please contact admin to be added."

Because the successful creation-and-sign-in pair happened on Android, we cannot conclude the iPhone build reaches the backend fine. The iPhone failure needs its own trace.

What is **not** confirmed: the exact reason the iPhone call failed. No server logs were retained for it, and the message shown is the app's catch-all fallback — displayed whenever the sign-in call fails for any reason, including network errors. Confirming the cause is step one of this plan, not an assumption baked into it.

Two structural weaknesses are visible in the code and remain plausible contributors, to be verified against iPhone-specific data once logging exists:

1. The code sent to the phone provider is verified **twice** per signup — once by the app before creating the account, once again by the server when creating the session. The extra account-creation call in between makes the second verification happen noticeably later on signup than on login. If the provider rejects the second check, signup fails while login succeeds. The fast/slow comparison we have is cross-platform, not same-device, so this stays a theory until an iPhone trace confirms it.
2. Any failure at that final step is reported as "Account not found", which is misleading and sends people to support instead of to a retry.

## Plan

### Step 1 — Make the real reason visible (server-side only, no new app release)

- Record every session-creation attempt (phone, platform/device, outcome, provider response, which internal step failed) into the existing OTP log table, so the next iPhone failure names its own cause. Capturing platform/device is essential now that we have no same-device comparison.
- Return a precise, distinguishable error message for each failure branch instead of collapsing them into "Account not found".

This changes nothing about installed apps' behaviour and is safe to ship immediately.

### Step 2 — Remove the double code-verification (server-side)

Make the server-side session step the single place the code is checked, and stop the signup screen from pre-checking it. The server keeps verifying — nothing becomes less secure — but the code is consumed once, removing the timing-sensitive second check that is a plausible (not yet confirmed) explanation.

Installed iPhone/Android apps still send the pre-check, so the server keeps accepting an already-verified code and old builds keep working.

### Step 3 — Recover instead of failing (server-side)

If the account exists but the session step fails transiently, the server retries session creation once before giving up. Account creation is already idempotent, so a retry never creates a duplicate account, a second referral assignment, or a charge.

### Step 4 — App-side clean-up (needs a new iOS/Android release)

- Signup screen: drop the pre-verification call, show the real error text returned by the server, and offer a "Try again" that reuses the same code without re-sending.
- Rebuild and sync the iOS app; the installed build is weeks old and will not carry any app-side change until a new release ships.

### Step 5 — Verification

Server-side (verifiable now): new signup end to end, invalid code rejected, expired code rejected, retry after interruption, existing-user login for customer/member, admin, network admin and delivery roles, signup with and without a referral code, previous guest-account continuity, website signup, session still valid after backgrounding.

Cannot be verified from here: the installed iPhone app. Desktop emulation does not prove it. After Steps 1-3 ship, one real iPhone signup attempt on the current installed build is needed — with platform logged, a success means no iOS release is required; a failure will name the cause exactly on that platform.

## Explicitly unchanged

Existing account IDs, orders, wallets and transaction history; referral/founder assignment; registration payment and membership activation; guest checkout; pricing, inventory, shipping and payment calculations; role permissions; automatic account creation is **not** added to ordinary login.

## Technical notes

- `supabase/functions/verify-otp-login/index.ts`: per-branch error codes (`OTP_REJECTED`, `NO_AUTH_USER`, `ROTATION_FAILED`, `SIGNIN_FAILED`), insert an `otp_send_log` row for each outcome including platform/device, single retry around `signInWithPassword` after rotation. Keep the "already verified" tolerance so installed builds that pre-verify continue to work.
- `src/pages/Signup.tsx`: remove the `msg91-verify-otp` call in `handleVerify`; pass `fullName`/`referralCode`/`founder` through; surface `error.message` verbatim.
- `src/contexts/AuthContext.tsx`: keep the fallback string only when the server returned no message; prefer the server's error code/message.
- `signup-create-user` phone lookup uses an exact `phone.eq` match while `verify-otp-login` matches on the last 10 digits — align `signup-create-user` on the same last-10 match so an existing profile stored without `+91` is never treated as new.
- No migration other than the log-write; no schema or RLS changes.
