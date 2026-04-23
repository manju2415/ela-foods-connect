
## Plan: Make Super Admin modules responsive in mobile view

### Problem to fix

In the Super Admin app, many admin pages use desktop-style tables and fixed-width layouts. On mobile, this causes horizontal overflow, so users must scroll sideways to see full content.

This is happening across multiple modules, including **Users Management**, because the current layout mostly relies on wide tables.

### What will change

1. **Fix the admin shell width behavior**
   - Update the Super Admin layout so the main content area can shrink properly on small screens.
   - Add safe width handling such as:
     ```text
     min-w-0
     max-w-full
     overflow-hidden where appropriate
     ```
   - This prevents the sidebar + content flex layout from forcing the page wider than the mobile viewport.

2. **Add reusable responsive admin list components**
   - Create a shared responsive pattern for admin modules:
     - desktop/tablet: keep normal table view,
     - mobile: show stacked cards instead of wide tables.
   - This avoids fixing one page at a time with inconsistent UI.

3. **Convert major admin tables to mobile card views**
   - On mobile, rows will become readable cards with labels and actions.
   - Example for Users Management:
     ```text
     User card
     - Name / email
     - Phone
     - Roles
     - Status
     - Joined date
     - Actions: edit, manage roles, remove
     ```
   - Desktop view will remain table-based.

4. **Apply the pattern across Super Admin modules**
   - Prioritize all modules that currently render tables:
     ```text
     Users
     Products
     Orders
     Categories
     Coupons
     Banners
     Advertisements
     Inventory
     Stores
     Store Inventory
     Delivery Partners
     Order Assignments
     Return Requests
     Testimonials
     Founding Members
     Founders
     Referral Codes
     Withdrawals
     ```
   - Each page will use:
     ```text
     hidden md:block      for desktop tables
     md:hidden            for mobile cards
     ```

5. **Improve mobile headers and filters**
   - Page headers will stack vertically on mobile.
   - Search inputs, filters, and action buttons will use full width on small screens.
   - Long titles, emails, names, SKUs, and addresses will wrap or truncate safely instead of pushing the layout wider.

6. **Fix dialogs and forms that overflow**
   - Update admin dialogs/forms with responsive grids:
     ```text
     grid-cols-1 on mobile
     sm:grid-cols-2 / md:grid-cols-3 on larger screens
     ```
   - Ensure dialogs stay inside the viewport:
     ```text
     max-w-[calc(100vw-2rem)]
     max-h-[90vh]
     overflow-y-auto
     ```

7. **Keep desktop behavior unchanged**
   - Desktop tables will remain available and functional.
   - Existing actions, filters, role management, order updates, remove user, and edit flows will continue working.

### Technical details

- Update `src/components/admin/AdminLayout.tsx`:
  - add `min-w-0` to the main layout container,
  - prevent child content from expanding beyond the viewport,
  - keep existing header/back/sidebar behavior.

- Update `src/components/ui/table.tsx` carefully:
  - keep table behavior for desktop,
  - avoid global changes that still force horizontal scroll on mobile.

- Add reusable admin mobile helpers, likely under:
  ```text
  src/components/admin/
  ```
  Examples:
  ```text
  AdminMobileCard
  AdminMobileField
  AdminResponsiveList
  ```
  These will standardize labels, values, badges, and action buttons.

- Update admin pages with table-heavy layouts:
  - keep existing `<Table>` markup for `md` and above,
  - add mobile card rendering below `md`,
  - replace fixed grids like `grid-cols-2` / `grid-cols-3` in dialogs with responsive classes.

### Expected result

```text
Mobile Super Admin app:
- no sideways page scrolling
- Users Management renders as cards
- Products, Orders, Inventory, Stores, etc. render responsively
- buttons and filters fit within the screen
- dialogs/forms fit within mobile viewport
- desktop layout remains table-based
```
