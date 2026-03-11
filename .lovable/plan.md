

## Skip OTP Screen - Immediate Login on "Send OTP"

### Approach
Modify `Auth.tsx` so that after `sendOtp` succeeds, immediately call `verifyOtp` with a mock code ("000000") and handle the login success flow directly. This bypasses the OTP screen completely.

### Changes Needed

**1. Modify `handleSendLoginOtp` in `Auth.tsx`:**
- After `sendOtp` succeeds, immediately call `verifyOtp` with mock code "000000"
- Execute the same post-login logic (role check, redirect) that currently runs after successful OTP verification
- Skip the `setStep("otp")` entirely

**2. Modify `handleSendSignupOtp` in `Auth.tsx`:**
- Same pattern - after storing signup metadata via `signUpWithOtp`, immediately verify with mock code
- Process MLM referral and redirect to appropriate page

**3. Clean up unused OTP-related state:**
- Remove the OTP step screen rendering (keep it in code but never shown)
- The `step` state can stay but will always remain "phone"

### Files to Edit
| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Modify `handleSendLoginOtp` and `handleSendSignupOtp` to auto-verify with mock code and complete login immediately |

