# Plan: Apply invite-only login restriction to mobile app only

Currently the `check-phone-registered` pre-check runs for every login attempt on `/auth` and `/mlm-login`, blocking unregistered numbers from receiving OTP on **both** web and mobile app. We need to scope this restriction to the mobile (Capacitor) app only — desktop/web should retain its existing behavior (allow OTP for any number).

## Approach

Gate the pre-check using `Capacitor.isNativePlatform()`:
- **Native app** → run `check-phone-registered`; block if not registered.
- **Web** → skip the pre-check; proceed straight to `msg91-send-otp`.

For defense-in-depth, also pass an explicit `source: "app"` flag to the edge function and have the function only enforce the block when that flag is present. If a future caller forgets to send the flag, the function will allow OTP (matching the web behavior).

## Files to edit

### 1. `src/pages/Auth.tsx`
- Import `Capacitor` from `@capacitor/core`.
- Wrap the existing `checkPhoneRegistered(...)` call (around line 247) in `if (Capacitor.isNativePlatform()) { ... }`.
- When skipped, proceed directly to `sendOtpViaMsg91(...)`.
- Pass `{ phone, source: "app" }` in the invoke body when called.

### 2. `src/pages/MLMLogin.tsx`
- Same change as Auth.tsx (line 118 area).

### 3. `supabase/functions/check-phone-registered/index.ts`
- Read optional `source` field from request body.
- If `source !== "app"` → always return `{ ok: true, registered: true, skipped: true }` (web bypass).
- Existing whitelist + profile lookup logic only runs when `source === "app"`.

## What stays the same
- Supabase auth config (`auto_confirm_email`), MSG91 OTP send, login/session creation in `AuthContext.createSessionForPhone`, healed-user migration, whitelist for QA/super admin numbers.
- Web users continue to log in via OTP exactly as before today.
- Native app users still see the "You are not added by any member. Please contact admin." block when their number isn't registered.

## Test cases after implementation
1. Web `/auth`: unknown number → OTP sent (existing behavior preserved).
2. Web `/mlm-login`: unknown number → OTP sent.
3. Native app `/auth`: unknown number → blocked with invite-only message, no OTP.
4. Native app `/auth`: registered number → OTP sent → login works.
5. Whitelisted test accounts (`9999000001`–`06`, `8050000300`) → always allowed on app.
