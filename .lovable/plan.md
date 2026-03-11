

# Switch to Mobile Number + OTP Authentication

## Overview
Replace all email-based registration and login with phone number + OTP (SMS verification). Users will enter their 10-digit Indian mobile number, receive an OTP via SMS, and verify it to sign in or sign up.

## SMS Provider Requirement
Phone OTP auth requires an SMS delivery provider. We need **Twilio** credentials configured as backend secrets:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`  
- `TWILIO_MESSAGING_SERVICE_SID` (or a `TWILIO_PHONE_NUMBER`)

These must be set before phone auth will work. I will configure the backend auth settings to enable phone provider.

## Database Changes
- **`profiles` table**: Already has a `phone` column -- no schema change needed
- **`handle_new_user()` trigger**: Update to store phone from `raw_user_meta_data` alongside email (phone auth stores phone in user metadata)

## Auth Flow Changes

### Login (Auth.tsx)
```text
Current:  Email + Password → Sign In
New:      Phone Number → Send OTP → Enter 6-digit code → Verify → Role-based redirect
```
- Step 1: User enters 10-digit mobile number with +91 prefix
- Step 2: Calls `supabase.auth.signInWithOtp({ phone })` 
- Step 3: User enters 6-digit OTP
- Step 4: Calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`
- Step 5: Existing role-based redirect logic kicks in

### Signup (Auth.tsx)
Same OTP flow but with additional fields (full name, referral code) collected before sending OTP. After OTP verification, process MLM referral as before.

### AddUserDialog (admin adding users)
- Change email field to phone number field
- Use edge function to create user with phone instead of email (admin API supports `phone` param)
- Update `create-delivery-partner` edge function similarly

### Edge Functions
- `create-delivery-partner`: Change from email to phone-based user creation
- `create-mlm-manager`: Change to phone-based credentials
- `seed-test-data`: Update test users to use phone numbers

## Files to Change

| Action | File | Change |
|--------|------|--------|
| Edit | `src/pages/Auth.tsx` | Replace email/password forms with phone+OTP two-step flow |
| Edit | `src/contexts/AuthContext.tsx` | Replace `signIn`/`signUp` methods with phone OTP methods |
| Edit | `src/components/AddUserDialog.tsx` | Phone field instead of email, use edge function for admin phone-based user creation |
| Edit | `supabase/functions/create-delivery-partner/index.ts` | Create user with phone instead of email |
| Edit | `supabase/functions/create-mlm-manager/index.ts` | Create manager with phone |
| Edit | `src/pages/CompleteRegistration.tsx` | Remove phone field (already captured at signup) |
| Edit | `src/pages/MLMLogin.tsx` | Phone + OTP login |
| Migration | Update `handle_new_user()` trigger to capture phone |
| Config | Enable phone auth provider via `configure_auth` tool |
| Secrets | Add Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`) |

## Implementation Order
1. Add Twilio secrets and enable phone auth provider
2. Update `handle_new_user()` trigger to store phone
3. Rewrite `AuthContext.tsx` with phone OTP methods
4. Rewrite `Auth.tsx` with phone + OTP UI (two-step form)
5. Update `MLMLogin.tsx` with same phone OTP flow
6. Update `AddUserDialog.tsx` and edge functions for phone-based user creation
7. Update `CompleteRegistration.tsx` to remove redundant phone field

