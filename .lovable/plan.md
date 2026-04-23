
## Plan: Fix Super Admin mobile responsiveness and back navigation

### Issues to fix

1. **Admin header is not responsive on phone**
   - The title `Ela Bazar Admin` is wrapping/breaking because the mobile header also shows:
     ```text
     Visit Site
     Logout
     ```
   - On narrow screens, there is not enough horizontal space.

2. **Back navigation inside Super Admin features is not clear/working**
   - After opening modules like Products, Categories, Orders, Network Admin, etc., the user needs an easy way to return to the previous admin screen.
   - The current admin layout only has the sidebar toggle, title, Visit Site, and Logout.

### What will change

1. **Make the Super Admin header mobile-friendly**
   - Keep `Ela Bazar Admin` on one line using `truncate` / `whitespace-nowrap`.
   - On mobile:
     - show compact icon-only buttons for Visit Site and Logout,
     - reduce spacing,
     - prevent the title from wrapping.
   - On desktop:
     - keep the current full text buttons:
       ```text
       Visit Site
       Logout
       ```

2. **Add a real Back button to the admin header**
   - Add a back arrow button in the admin header when the user is not on the main `/admin` dashboard.
   - Example behavior:
     ```text
     /admin/products           -> Back returns to previous admin screen
     /admin/categories         -> Back returns to previous admin screen
     /admin/network-admin      -> Back returns to previous admin screen
     /admin/network-analytics  -> Back returns to previous admin screen
     ```
   - If there is no useful previous page, it will safely return to:
     ```text
     /admin
     ```

3. **Close the sidebar automatically after selecting a module on mobile**
   - When the mobile sidebar is open and the user taps a menu item, the sidebar drawer should close automatically.
   - This prevents the screen from looking stuck behind the sidebar overlay.

4. **Improve admin content spacing on mobile**
   - Reduce page padding on small screens:
     ```text
     mobile: p-3 or p-4
     desktop: p-6
     ```
   - This gives more room for admin tables, cards, and forms on phones.

5. **Keep Super Admin access unchanged**
   - The number:
     ```text
     8050000300
     ```
     will still default to:
     ```text
     /admin
     ```
   - It will still see all Super Admin modules, including the integrated Network Admin section.

### Technical details

- Update `src/components/admin/AdminLayout.tsx`:
  - add mobile-safe header layout,
  - add a conditional back button using `useNavigate`,
  - make title non-wrapping/truncated,
  - make Visit Site and Logout icon-only on small screens,
  - adjust main content padding responsively.

- Update `src/components/admin/AdminSidebar.tsx`:
  - use `setOpenMobile(false)` from `useSidebar()` when a sidebar link is clicked,
  - keep desktop sidebar behavior unchanged.

- No database changes are needed.

### Expected result

```text
/auth + 8050000300 -> /admin

Mobile admin header:
- "Ela Bazar Admin" stays on one line
- Visit Site / Logout no longer force title wrapping
- Back arrow appears inside feature pages
- Sidebar closes after tapping a module
- Super Admin can still see all modules
```
