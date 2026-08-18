# Make member names visible in the network tree

## What's wrong

The names are in the database — Manoj Kumar's direct referrals are stored with real names (B Raja, Krishna Das MC, Ramesh PK, etc.). The tree rows simply have no room to show them on a phone: each row puts the name block next to three fixed-width badges (level, L1, "N refs") plus an indent per depth, so on a narrow screen the badges win and the name/email column collapses to zero width. That's exactly what the screenshot shows: avatar, then blank space, then the badges.

## The fix

1. **Row layout (network tree on the member dashboard)**
   - Stack the row on small screens: name on its own line (full width, allowed to wrap/truncate), badges on a second line below.
   - Keep the current single-line layout on larger screens.
   - Cap the per-level indent on mobile so deep levels don't squeeze the content.
   - Show the phone-derived login id in a lighter style under the name instead of the long `@elabazar.local` email.

2. **Member preview**
   - Make each row tappable: opens a bottom sheet (mobile) / dialog (desktop) with the member's name, level, depth, direct-referral count, and join date.
   - Sheet lists that member's direct referrals by name, so a founder can see who sits under any node without expanding the whole tree.

3. **Apply the same row fix to the other two places the tree appears**
   - Member mobile app network list.
   - Admin network tree, so long names don't get clipped there either.

## Technical notes

- Files: `src/components/dashboard/NetworkTreeVisual.tsx` (main fix + preview sheet), `src/pages/mobile/member/NetworkPage.tsx`, `src/components/admin/AdminNetworkTree.tsx`.
- No database or RPC changes; `get_user_downline` already returns `full_name`, `email`, `user_level`, `level_depth`, `referred_by` — the preview sheet is built from data already fetched client-side.
- Indent switches from inline `depth * 16px` to a capped value (e.g. `min(depth, 4) * 12px` on mobile).
