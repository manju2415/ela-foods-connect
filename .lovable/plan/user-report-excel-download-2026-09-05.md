# User Report Excel Download

## Goal
Convert the existing user report download on the Super Admin Users page from CSV to a proper Excel (.xlsx) file with the same three columns: User Name, Mobile Number, Email.

## What will change

1. **Dependency**
   - Add the `xlsx` package to generate `.xlsx` files client-side.

2. **UI location (unchanged)**
   - Keep the "Download Report" button on `/admin/users`, visible only to Super Admins, next to the "Invite your circle and Earn" button.

3. **Export logic**
   - Replace the current CSV builder in `src/pages/admin/Users.tsx` (`exportUserReport`) with Excel generation.
   - Columns: User Name, Mobile Number, Email.
   - File name: `user-report-<yyyy-MM-dd>.xlsx`.
   - Include all users currently loaded in the page (same source as today: profiles joined with roles/wallets).

4. **Behavior preserved**
   - Button disabled when no users are loaded.
   - Toast confirmation on download.

## Out of scope
- No new backend endpoint or edge function.
- No additional columns or filters in this iteration.
- No changes to the Users table UI.

## Files to modify
- `src/pages/admin/Users.tsx`
- `package.json` (via `bun add xlsx`)
