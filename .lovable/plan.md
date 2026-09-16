# iPhone signup: account is created but sign-in shows "Account not found"

## What the live data shows (checked just now)

- Sign-in attempt logging has been in place since 9 September. In the whole log there are only **two** recorded failures, both from 9 September test numbers. Every real attempt since then is recorded as a success, including attempts marked `ios`.
- Several recent accounts exist with **no sign-in ever recorded** — for example Kanakaraj (9731411909) and Janardhanan (9886459486), both created 14 September, and Manju (8951774194). Their account records are complete and confirmed, matching your description: the details are saved, but the person never gets signed in.
- For those same accounts there is **no record of the sign-in step being called at all** — not a failure, nothing. So the failing iPhone attempts are not reaching the server step that would log the real reason.
- Server logs for the two functions involved are no longer retained, so the failed calls cannot be traced after the fact.

What this points to — not yet proven — is that the installed TestFlight app is running an **older bundled copy of the app** (from before the 9 September signup fix), which showed "Account not found. Please contact admin to be added." as a catch-all whenever the sign-in call failed for any reason. Since you're not sure when that build was made, confirming this is step one, not an assumption.

## Plan

### Step 1 — Make the installed app identify itself (server-side + app-side)

- Stamp every sign-in and account-creation call with the app's build version and platform, and record it with the attempt. The moment a tester tries again, we will know exactly which bundle they are on and whether the call arrived.
- Add the same attempt logging to the account-creation step, which currently records nothing. This closes the blind spot where an account is created but the sign-in that follows leaves no trace.

### Step 2 — Never show "Account not found" for a failure that isn't one

On the phone, when the sign-in call fails without a server reply (no network, blocked request, timeout), show a plain "Couldn't reach the server — check your connection and tap Try again" instead of the misleading admin message. Keep the real server wording whenever the server does answer.

### Step 3 — Rescue the people already stuck

For accounts that exist with no sign-in yet, nothing is broken in their record — they only need a successful sign-in. Once Steps 1-2 ship, ask one of them to open the app and log in with their number (not sign up again). Signing up again is already safe and will not duplicate accounts, referrals or charges.

### Step 4 — Ship a fresh iPhone build

Rebuild and upload a new TestFlight build from current code. This is the decisive step if the installed build is indeed old; it also carries Steps 1-2 to the phone. Nothing in Steps 1-2 breaks older installed builds.

### Step 5 — Verification

Verifiable from here: account creation, sign-in for customer/member, admin, network admin and delivery roles, signup with and without a referral code, wrong and expired codes rejected, retry after interruption, existing accounts untouched, website and Android signup unchanged.

Cannot be verified from here: the installed iPhone app. One real iPhone attempt on the new build is needed; a desktop preview does not prove it. After Step 1 ships, even a failed attempt will name its own cause and the build it came from.

## Explicitly unchanged

Existing account IDs, orders, wallets and transaction history; referral and founder assignment; registration payment and membership activation; guest checkout; pricing, inventory, shipping and payment calculations; role permissions. Ordinary login still never creates an account.

## Technical notes

- `verify-otp-login`: include an `appVersion` field (sent by the client, falls back to "unknown") in the `otp_send_log` row alongside the existing platform label; no behaviour change to the verification or session branches.
- `signup-create-user`: write an `otp_send_log` row per attempt (`signup:CREATED` / `signup:EXISTING` / `signup:FAILED`) with phone, platform and reason. Add the same `outcome` prefix to the table's allowed values.
- `AuthContext.createSessionForPhone` / `Signup.tsx`: pass platform + app version; when the invoke returns no server body, surface a connectivity message instead of the server's 404 wording.
- iOS: `npx cap sync` and a new archive/upload; `capacitor.config.ts` already has the dev `server.url` commented out, so the build bundles local assets correctly.
- No schema changes beyond widening the log `outcome` check constraint; no migration touching user, order, wallet or payment data.
