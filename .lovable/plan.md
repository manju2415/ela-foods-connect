# Login failure for +91 98451 21558 — findings and proposed fix

## What the records show (read-only checks, nothing changed)

**The account is healthy.**
- Profile: Sudevan P M, phone stored as `+919845121558`, active, created 15 Aug.
- One matching login account, `919845121558@elabazar.local`, email confirmed, no duplicates.
- Last successful sign-in: **today 22 Sep, 05:01:29 UTC** (10:31 IST) — recorded as a success from the website on an iPhone.
- Earlier successes on 16 Sep (twice) and 15 Sep.

**No failure was ever recorded for this number.** Every login attempt the server actually received for him succeeded. Across the whole log there has never been a single "account not found" result for anyone — not once, for any number.

**But many codes were sent and never used.** Codes went out on 10, 17 (x3), 18, 19, 21 (x3) and 22 Sep (x3) with no matching login attempt on the server at all. So on those occasions he entered the code and the request never reached us.

## What this means

The wording he sees — "Account not found. Please contact admin to be added." — no longer exists as a server reply. It only exists in the **older version of the website** that his browser is still loading from cache. In the current version that same situation shows a connection message instead.

So the most likely cause is: his browser/app is running a stale copy of the site, and his verify request is failing before it reaches the server (connection drop, cached old code), while the old copy mislabels that as "account not found".

This is consistent, not proven — no server-side trace exists for the failed attempts, by definition.

## Proposed fix (nothing done yet — awaiting confirmation)

1. **Force stale browsers to pick up the current site.** Serve the entry page as never-cached and bump the build marker, so a returning visitor always loads the latest version instead of a months-old one. This touches only hosting/caching config and the build marker — not the login path.
2. **Record failures that never reach the server.** When the verify call fails with no reply from the server, write one log row (number, platform, HTTP status, message) so the next occurrence names its own cause instead of leaving a blank. Best-effort and non-blocking.
3. **Ask him to do one hard refresh** (or reinstall the app) and try once; then read the new log row if it fails again.

No changes to `src/pages/Auth.tsx`, `src/pages/Signup.tsx`, `src/pages/MLMLogin.tsx`, `supabase/functions/verify-otp-login`, or `supabase/functions/msg91-send-otp` — the recently fixed files stay untouched. If you prefer, step 2 can be dropped and only the cache fix applied.

## Explicitly unchanged

Accounts, orders, wallets, transactions, referrals, registrations, roles, pricing, guest checkout — none touched. This is read-only diagnosis plus, if approved, caching and logging only.

## Technical notes

- `otp_send_log`: 160 `session:SUCCESS`, 6 `session:OTP_REJECTED`, 6 `session:SIGNIN_FAILED` (all test numbers, "Email not confirmed"), zero `session:NO_AUTH_USER` ever.
- `AuthContext.createSessionForPhone` already prefers the server message and falls back to "Could not sign in. Please check your connection and try again." — the "Account not found" string is only in the deployed old bundle and the server's `NO_AUTH_USER` branch, which has never fired.
- Cache fix: add `Cache-Control: no-store` headers for `/` and `/index.html` in `vercel.json`, bump `src/buildMark.ts`.
- Logging: new small helper called from the failure branch of `createSessionForPhone`, writing `session:CLIENT_INVOKE_FAILED` to `otp_send_log`.
