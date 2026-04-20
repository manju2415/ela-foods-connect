
The user already has MSG91 integrated (edge functions `msg91-send-otp`, `msg91-verify-otp`, `msg91-config` exist with `MSG91_AUTH_TOKEN` and `MSG91_TEMPLATE_ID` secrets configured). The frontend is still using mock OTP `000000`. I need to wire the existing MSG91 functions into the auth flows and remove all mock OTP code.

Per system rules, I cannot add backend rate limiting (no primitives). I'll mention this to the user and rely on MSG91's built-in rate limiting + simple client-side resend cooldown.

Files using `MOCK_OTP = "000000"`:
- `src/pages/Auth.tsx` (main login/signup)
- `src/pages/MLMLogin.tsx` (network manager login)

Plan is straightforward: replace mock verification with calls to the existing edge functions.

## Plan: Replace Mock OTP with Real MSG91 SMS OTP

### Current State (already done)
- MSG91 edge functions deployed: `msg91-send-otp`, `msg91-verify-otp`
- Secrets configured: `MSG91_AUTH_TOKEN`, `MSG91_TEMPLATE_ID`
- DLT-registered template ID is set on the backend

### What's Broken
Frontend (`Auth.tsx`, `MLMLogin.tsx`) still uses hardcoded `MOCK_OTP = "000000"` and never calls MSG91. So real SMS is never sent or verified.

### Changes

**1. `src/pages/Auth.tsx`**
- Remove `MOCK_OTP` constant
- In `handleSendLoginOtp` / `handleSendSignupOtp`: call `supabase.functions.invoke('msg91-send-otp', { body: { phone: fullPhone } })` after `signOut()`. Show error toast if it fails.
- In `handleVerifyOtp`: call `supabase.functions.invoke('msg91-verify-otp', { body: { phone, otp } })`. If success, proceed to `createSessionForPhone`. If not, show "Invalid OTP" error.
- Add a 30-second resend cooldown timer + "Resend OTP" button on the OTP step.

**2. `src/pages/MLMLogin.tsx`**
- Same treatment: remove `MOCK_OTP`, call real MSG91 send/verify, add resend cooldown.

**3. Test account exception (important)**
The 6 hardcoded test accounts (`9999000001`–`9999000006`) used by team for QA won't receive real SMS (fake numbers). Keep a tiny bypass: if phone matches one of these test numbers AND OTP is `000000`, skip MSG91 verify. This preserves your QA workflow without exposing the bypass to real users.

**4. Verify DLT template alignment**
You mentioned:
- Entity: `Ela Foods and Snacks Pvt Ltd`
- DLT Reg No: `1001428719051529349`
- Telecom: Airtel DLT

The MSG91 template (`MSG91_TEMPLATE_ID` secret) must be approved on MSG91's dashboard with this DLT entity + an approved sender ID (typically 6 chars like `ELABZR`). I'll add a note in the chat after implementation reminding you to confirm the template is approved and the sender ID is set on MSG91 — these are configured in the MSG91 dashboard, not in code.

### About Rate Limiting
The Lovable backend doesn't have rate limiting primitives yet. MSG91 enforces its own per-number rate limits (default ~3 OTP/min/number on their side). I'll add a 30-second client-side resend cooldown for UX — but a real client can bypass this. For stronger protection, MSG91's account-level limits will catch abuse.

### Provider Recommendation
**MSG91** is already integrated and is the best choice for India + DLT:
- Native DLT compliance
- Airtel DLT supported out-of-box
- Built-in OTP API with auto-generation, retry, and verify
- Good delivery rates on Indian networks

No need to switch providers.

### Files Changed
| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Replace mock OTP with MSG91 calls + resend cooldown |
| `src/pages/MLMLogin.tsx` | Replace mock OTP with MSG91 calls + resend cooldown |

No database changes. No new edge functions. No new secrets.
