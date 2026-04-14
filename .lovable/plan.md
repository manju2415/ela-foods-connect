

## Plan: Phone-Only Login + Commission Attribution to Adding Member

### Problem
1. **Login**: Some users (e.g., test123@gmail.com) have no phone number, making phone-based login impossible. All logins must be phone-only.
2. **Commission attribution**: Currently, commissions go to the **referral code owner**, not the **member who added the user**. When a member adds a new user, their own referral code should be auto-selected (not a dropdown of all codes).

### Changes

#### 1. AddUserDialog — Auto-select the logged-in member's referral code
**File**: `src/components/AddUserDialog.tsx`
- Import `useAuth` to get the current user.
- On dialog open, fetch the logged-in user's own referral code from `referral_codes` table.
- Auto-populate and lock the referral code field to this code (no selector, no editing).
- Remove `showCodeSelector` prop usage — always use the caller's code.
- If the logged-in user has no referral code, show a message asking them to generate one first.

#### 2. Dashboard — Simplify AddUserDialog usage
**File**: `src/pages/Dashboard.tsx` (line ~368)
- Remove `defaultReferralCode` and `showCodeSelector` props — the dialog now self-resolves the caller's code.

#### 3. Admin Users page — Keep selector for admins
**File**: `src/pages/admin/Users.tsx` (line ~179)  
- Add a new prop `isAdmin={true}` to `AddUserDialog` so admins can still pick any referral code via the selector.

#### 4. Edge Function — Accept `added_by` user ID
**File**: `supabase/functions/add-network-user/index.ts`
- Accept an optional `added_by_user_id` field in the request body.
- When present, set `profiles.referred_by` to `added_by_user_id` (the caller) regardless of referral code ownership.
- The referral code is still validated and its `usage_count` incremented, but the **referral relationship** and **commission chain** point to the caller.

#### 5. Ensure all test users have phone numbers
- Use the database insert tool to update `test123@gmail.com`'s profile with a phone number so they can log in via phone OTP.

### Technical Details

**Commission flow change**: Currently `process_mlm_referral` sets `referred_by = referral_code_owner`. The edge function will now explicitly set `referred_by = caller_id` **after** calling `process_mlm_referral`, overriding the code owner. Alternatively, the edge function can set `referred_by` before calling the RPC and skip the RPC's own `referred_by` update (since it already exists).

**AddUserDialog changes**: The component will fetch the current user's referral code on mount. The referral code field becomes read-only for non-admin users, showing the auto-resolved code. If no code exists, a "Generate Code" button is shown instead of the form.

