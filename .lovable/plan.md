
## Plan: Add Network Admin as a Super Admin dashboard module

### Current setup

Yes — currently the app has two separate admin areas:

```text
/admin      -> Super Admin / E-commerce Admin dashboard
/mlm-admin  -> MLM / Network Manager dashboard
```

The Network Manager pages already exist, but they are mostly available through the separate `/mlm-admin` dashboard. I will add them into the Super Admin dashboard as a dedicated **Network Admin** module, while keeping `/mlm-admin` available for standalone network managers.

### What will change

1. **Add a Network Admin section inside `/admin`**
   - Add a separate Network Admin module in the Super Admin sidebar.
   - This will appear only for Super Admin users.
   - Store admins will not see or access this module.

2. **Add a Network Admin dashboard page inside Super Admin**
   - Add a route like:

   ```text
   /admin/network-admin
   ```

   - This page will show the network overview stats currently shown in the MLM dashboard:
     - Total members
     - Founders
     - Masters
     - Associates
     - Total referrals
     - Referral codes
     - Wallet balance
     - Pending withdrawals

3. **Move Network-related links into the Super Admin module**
   - Add Network Admin links under the `/admin` dashboard, such as:

   ```text
   /admin/network-admin
   /admin/network-analytics
   /admin/users
   /admin/founding-members
   /admin/referral-codes
   /admin/founders
   /admin/mlm-settings
   /admin/withdrawals
   ```

   - These pages will continue using the Super Admin layout when accessed from `/admin`.

4. **Keep `/mlm-admin` as a separate login/dashboard**
   - The standalone Network Manager dashboard will remain available:

   ```text
   /mlm-login -> /mlm-admin
   ```

   - This is useful for users who should only manage the network side without seeing the full Super Admin e-commerce dashboard.

5. **Protect Network Admin pages properly**
   - Network Admin pages inside `/admin` will be restricted to Super Admin access.
   - Regular store admins should not be able to manually open network admin routes.

### Technical details

- Create/reuse a shared Network Dashboard content component so both dashboards can display the same network stats without duplicating logic.
- Update `src/App.tsx` with the new Super Admin route:

```text
/admin/network-admin
```

- Update `src/components/admin/AdminSidebar.tsx` to include a separate **Network Admin** section or grouped links.
- Ensure the new module is visible only when `isSuperAdmin` is true.
- Keep the existing `/mlm-admin` routes and `MLMAdminLayout` unchanged for dedicated Network Manager users.
- Add route/page guarding where needed so network management pages are not accessible by store admins through direct URLs.

### Expected result

```text
/auth + Super Admin login
  -> /admin
  -> sidebar includes Network Admin module

/admin/network-admin
  -> network dashboard inside Super Admin layout

/mlm-login + Network Manager login
  -> /mlm-admin
  -> standalone Network Manager dashboard remains available
```
