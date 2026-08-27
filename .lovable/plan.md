# Crash Audit — Findings and Proposed Fixes

I scanned the app (pages, contexts, hooks, Capacitor plugin usage, dialogs, offline storage) for things that can crash or white-screen, especially inside the Android APK WebView. No runtime errors are currently recorded, and the app already has good protection: a top-level error boundary, a single Suspense wrapper around all lazy routes, and global `error` / `unhandledrejection` handlers that show a toast instead of dying.

## What can actually crash today

### 1. Copy-to-clipboard buttons (most likely real-device failure)
`navigator.clipboard` is undefined on older Android System WebViews and in non-secure/unfocused contexts. Three places call it with no guard and no try/catch:
- Member Dashboard — copy referral code
- Referral section — copy referral link
- Admin > Founders — copy referral code

Effect: the button throws, copy silently fails, and the user sees the generic "An unexpected error occurred" toast.

### 2. Legacy push-notification hook (dead but dangerous)
`usePushNotifications` is defined but never imported anywhere; the app uses the FCM hook instead. Its `addListener` calls are not wrapped in try/catch, so if anyone wires it up later it can throw inside an effect — exactly the class of error that blank-screens the APK.

### 3. Silent-failure database reads
Withdrawal section and the admin User Dashboard viewer use `.single()` (errors when zero rows) instead of `.maybeSingle()`, and ignore the error. A user with no wallet row yet sees a blank panel with no explanation rather than an empty state.

## What I checked and found safe
- Capacitor push notifications (FCM), splash screen, status bar, native contacts — all platform-gated and wrapped in try/catch.
- Contact picker dialog and delivery photo capture — no dialog content rendered off unchecked null data.
- Offline IndexedDB storage and sync — every call guarded, boolean-key issue already worked around.
- No unguarded destructuring of Supabase results, no render loops, no `throw` in render paths found.

## Proposed fixes (nothing built yet)
1. Add a small `copyToClipboard` helper that feature-detects `navigator.clipboard`, falls back to a hidden textarea + `execCommand`, and toasts on failure. Use it in the three copy call sites.
2. Delete the unused `usePushNotifications` hook (FCM hook is the live one), or wrap its listeners in try/catch if you want to keep it.
3. Switch the two `.single()` reads to `.maybeSingle()` and render a proper empty state when there is no row.

## Technical notes
- Files touched by the fixes: `src/lib/` (new clipboard helper), `src/pages/Dashboard.tsx`, `src/components/dashboard/ReferralSection.tsx`, `src/pages/admin/Founders.tsx`, `src/components/dashboard/WithdrawalSection.tsx`, `src/components/admin/UserDashboardViewer.tsx`, `src/hooks/usePushNotifications.ts` (removal).
- No database, backend, or business-logic changes involved.
