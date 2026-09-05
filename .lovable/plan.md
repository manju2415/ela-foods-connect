# Download a report for a single user

## Goal
On the Users page in the admin area, allow downloading a spreadsheet for one person instead of only the full list of everyone.

## What will change

1. **Per-row download**
   - Each row in the Users list gets a small download action (in the existing actions area).
   - Clicking it saves a spreadsheet containing just that person: User Name, Mobile Number, Email.
   - File name: `user-<name-or-mobile>-<yyyy-MM-dd>.xlsx`.

2. **Existing full report**
   - The current "Download Report" button (all users in one sheet) stays as it is.

3. **Feedback**
   - A short confirmation appears after the file is saved.

## Out of scope
- No new backend work or database changes.
- No extra columns beyond name, mobile and email.
- No change to the Users table data or filters.

## Technical notes
- `src/pages/admin/Users.tsx`: extract the current `exportUserReport` sheet-building logic into a small helper that takes a list of users, then call it with a single user from the new per-row button. Reuses the already-installed `xlsx` package and the same column headers.
