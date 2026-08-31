# Verify Products entry point from member home screen

## Current state

The member home screen already has three entry points to the product catalogue:

1. **Header "Browse Products" button** in `src/pages/Dashboard.tsx` (lines 371-377) — navigates to `/products`.
2. **Overview "Shop products" shortcut card** in `src/pages/Dashboard.tsx` (lines 443-463) — navigates to `/products`.
3. **Bottom navigation "Shop" tab** in `src/components/mobile/MobileBottomNav.tsx` (lines 24-31) — points to `/products`.

## Plan

1. Verify the `/member-app` route renders the dashboard with the "Browse Products" button visible in the live preview.
2. Verify the "Shop" tab appears in the mobile bottom navigation on a small viewport.
3. Confirm both the button and the tab navigate to `/products` without errors.
4. If the preview is correct but the user's installed APK still lacks the button, recommend rebuilding/publishing the APK.

## Expected outcome

The member home screen shows a clear path to browse products, and navigation works end-to-end.
