# Make product browsing obvious on the member home screen

## What the screenshot shows

The phone in the screenshot is running an older build: the header says "Manage your account, orders, and wallet" and the bottom bar has only Home / Network / Wallet / Profile. The current code already has both entry points — a "Browse Products" button next to "Add User" and a "Shop" tab in the member bottom navigation. So the first action is a fresh publish / APK rebuild.

On top of that, the current entry points are still easy to miss on a small phone, so the plan also strengthens them.

## Changes

1. Make the shopping entry point primary on the member dashboard: "Browse Products" becomes the filled primary button (Add User moves to outline), full-width on mobile so it is the first thing seen under the title.
2. Add a compact shop shortcut card in the Overview tab (next to Wallet Balance / Total Orders) that links to the product catalogue, so browsing is reachable even after scrolling into stats.
3. Add a cart icon with item count in the member app header so members can reach the cart and catalogue from any member screen.
4. Confirm the member bottom nav "Shop" tab points at `/products` and stays readable on 5 items at small widths.

## Technical notes

- `src/pages/Dashboard.tsx` — button hierarchy/ordering in the header block, new shortcut card in the Overview grid.
- `src/components/mobile/MobileHeader.tsx` — add cart action (reuse `CartSheet` and `useCart`).
- `src/components/mobile/MobileBottomNav.tsx` — verify member items only; no behaviour change expected.
- No backend or business-logic changes.

## After building

Publish the web app and rebuild the APK; the device in the screenshot will keep showing the old layout until it picks up the new build.
