# Fix iPhone signup failing with "Account not found"

## What the evidence shows so far

For the failing number 9742586326 (Shyla), checked directly in the live database:

- The account **was** created at 08:48:30 today, email confirmed at 08:48:30, wallet created, referrer assigned.
- A successful sign-in for the same account happened at 08:50:07 — about 90 seconds later.

So account creation succeeded, and the step that failed on the first tap was the final sign-in step, not account creation. The user then got in on a retry. Existing-user login works on the same iPhone build, so the app can reach the backend fine.

What is **not** yet confirmed: the exact reason that first sign-in call failed. There are no server logs retained for that call, and the message the user saw ("Account not found. Please contact admin to be added.") is the app's catch-all fallback — it is shown whenever the sign-in call fails for any reason, including network errors. So the message itself does not identify the cause. Confirming the cause is step one of this plan, not an assumption baked into it.

Two structural weaknesses are visible in the code and are plausible contributors:

1. The code sent to the phone provider is verified **twice** per signup — once by the app before creating the account, once again by the server when creating the session. Between the two there is now an extra account-creation call, so the second verification happens noticeably later on signup than on login. If the provider rejects the second check, signup fails while login (fewer steps, faster) succeeds.
2. Any failure at that final step is reported to the user as "Account not found", which is misleading and sends people to support instead of to a retry.

## Plan

### Step 1 — Make the real reason visible (server-side only, no new app release)

- Record every session-creation attempt (phone, outcome, provider response, which internal step failed) into the existing OTP log table, so the next iPhone signup failure names its own cause instead of us guessing.
- Return a precise, distinguishable error message for each failure branch instead of collapsing them into "Account not found".

This alone changes nothing for the installed apps' behaviour and is safe to ship immediately.

### Step 2 — Remove the double code-verification (server-side)

Make the server-side session step the single place the code is checked, and stop the signup screen from pre-checking it. The server keeps verifying — nothing becomes less secure — but the code is consumed once, removing the timing-sensitive second check that best explains why the slower signup path fails while login succeeds.

Because installed iPhone/Android apps still send the pre-check, the server keeps accepting an already-verified code (as it does today), so old builds keep working.

### Step 3 — Recover instead of failing (server-side)

If the account exists but the session step fails transiently, the server retries the session creation once before giving up. Signup retries stay safe: account creation is already idempotent, so a retry never creates a duplicate account, a second referral assignment, or a charge.

### Step 4 — App-side clean-up (needs a new iOS/Android release)

- Signup screen: drop the pre-verification call, show the real error text returned by the server, and offer a "Try again" that reuses the same code without re-sending.
- Rebuild and sync the iOS app; the installed build is weeks old, so it will not carry any app-side change until a new release ships.

### Step 5 — Verification

Server-side (can be verified now): new signup end to end, invalid code rejected, expired code rejected, retry after interruption, existing-user login for customer/member, admin, network admin and delivery roles, signup with and without a referral code, previous guest-account continuity, website signup, session still valid after backgrounding.

Cannot be verified from here: the installed iPhone app itself. Desktop emulation does not prove it. After Steps 1-3 ship, one real iPhone signup attempt on the current installed build is needed — if it now succeeds, no iOS release is required; if it still fails, the new logs will name the cause exactly.

## Explicitly unchanged

Existing account IDs, orders, wallets and transaction history; referral/founder assignment; registration payment and membership activation; guest checkout; pricing, inventory, shipping and payment calculations; role permissions; automatic account creation is **not** added to ordinary login.

## Technical notes

- `supabase/functions/verify-otp-login/index.ts`: per-branch error codes (`OTP_REJECTED`, `NO_AUTH_USER`, `ROTATION_FAILED`, `SIGNIN_FAILED`), insert an `otp_send_log` row for each outcome, single retry around the `signInWithPassword` after rotation. Keep the "already verified" tolerance so installed builds that pre-verify continue to work.
- `src/pages/Signup.tsx`: remove the `msg91-verify-otp` call in `handleVerify`; pass `fullName`/`referralCode`/`founder` through, surface `error.message` verbatim.
- `src/contexts/AuthContext.tsx`: keep the fallback string but only when the server returned no message; prefer the server's error code/message.
- `signup-create-user` phone lookup uses an exact `phone.eq` match while `verify-otp-login` matches on the last 10 digits — align `signup-create-user` on the same last-10 match so an existing profile stored without `+91` is never treated as new.
- No migration other than the log-write; no schema or RLS changes.
