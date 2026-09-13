# Login failing for 7025430609 (Akshay p k)

## What I found

His account is healthy. Nothing is missing:

- Account exists, phone `+917025430609`, registration fee paid, roles member + admin
- He **successfully logged in from the Android app at 09:15 today**
- OTP messages are being delivered fine (several sends logged today)

So "Account not found. Please contact admin to be added." is wrong — the account is there.

## Why that message appears

That exact sentence is the **old** wording. It was removed from the app on 9 September and replaced with honest, specific errors. The screen in the photo is still showing it, which means the browser he is using is running an **older version of the site** — either it was never republished after the 9 September fix, or his browser is holding a cached copy.

Underneath, the sign-in request never reached our server at all: there is no record of any sign-in attempt for his number at that time, while successful ones from other people the same hour are all recorded. In the old version, any request that failed to reach the server (dropped connection, stale saved session, cached page) was shown as "Account not found" regardless of the real cause. That is what he is seeing.

## What to do

1. **Republish the site** so the corrected version — with real error messages instead of the catch-all — is what people actually load.
2. **Force stale browsers to pick up the new version** so a cached old copy can't keep showing the wrong message.
3. **Make a failed sign-in name itself even when the server is never reached**: when the sign-in call fails at the network level, the app records the failure (phone, platform, HTTP status, message) so the next report has evidence instead of guesswork.
4. **Test the live site end to end** with his number path: send OTP, wrong OTP, correct OTP, and confirm the session is created and the right landing page is reached.

If after republishing he still can't get in, the new message will state the actual reason (wrong/expired code, connection problem, provider issue), and it will be recorded for me to read.

## Nothing else changes

No accounts, roles, wallets, orders, payments, referrals or registrations are touched. Android app login, website login, admin/network/delivery logins, signup, and guest checkout all keep working exactly as now; the only code change is on the error-reporting path.

## Technical notes

- `src/contexts/AuthContext.tsx` already prefers the server's message; add a `logClientAuthFailure` call on the `invoke` failure branch that posts to a small endpoint writing `otp_send_log` with outcome `session:CLIENT_INVOKE_FAILED` and the HTTP status/message. Best effort, never blocks or alters the user-facing result.
- Cache busting: `index.html` gets no-store on the document plus a build-version check so an open tab reloads when a new build is live; hashed assets are already versioned.
- No changes to `verify-otp-login`, `signup-create-user`, `check-phone-registered`, or any database object.
- Separate issue spotted while looking: `supabase/config.toml` declares `[functions.razorpay-webhook]` but `supabase/functions/razorpay-webhook/` does not exist — the Razorpay webhook endpoint is still unbuilt, so the webhook secret you saved is unused. Not part of this fix.
