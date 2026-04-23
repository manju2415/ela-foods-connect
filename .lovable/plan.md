
## Plan: Switch super admin to `8050000300` and allow all dashboard logins

### Confirmation

The number currently configured from the previous change is:

```text
8050090300
```

Your confirmed number is different:

```text
8050000300
```

I will update the system so `8050000300` becomes the active super admin/all-access login number.

### What will change

1. **Make `8050000300` the all-access admin number**
   - Support these phone formats:
     ```text
     8050000300
     918050000300
     +918050000300
     ```
   - Automatically assign this number:
     - `super_admin` for `/admin`
     - `mlm_admin` for `/mlm-login` → `/mlm-admin`
     - `member` or founding/member access for member dashboard access
     - delivery partner access for `/driver-app`

2. **Remove privileged access from old/mistaken numbers**
   - Keep removing admin access from:
     ```text
     9108682966
     ```
   - Also remove privileged roles from the previously configured mistaken number:
     ```text
     8050090300
     ```
   - This avoids two real numbers having super admin access accidentally.

3. **Fix `/auth` redirect priority**
   - If a user has both super admin and delivery partner access, the current `/auth` role resolver would send them to `/driver-app` first.
   - I will update the redirect priority so:
     ```text
     /auth + 8050000300 -> /admin
     ```

4. **Allow `/mlm-login` for the same number**
   - Because the confirmed number should access all dashboards/logins:
     ```text
     /mlm-login + 8050000300 -> /mlm-admin
     ```

5. **Ensure direct dashboard access works**
   - The same account should be allowed to access:
     ```text
     /admin
     /mlm-admin
     /member-app
     /driver-app
     /customer-app
     ```

### Technical details

- Update the backend `handle_new_user()` role assignment function so future logins/signups use `8050000300`, not `8050090300`.
- Run database data updates to:
  - remove privileged roles from `9108682966`,
  - remove privileged roles from `8050090300`,
  - add required roles to `8050000300`,
  - create/ensure a delivery partner record for `8050000300`.
- Update frontend redirect logic in `/auth` so super admin has priority over delivery partner when deciding the landing page.
- Keep `/mlm-login` behavior role-based, but now `8050000300` will pass because it will have the `mlm_admin` role.
- Update project memory so future changes do not revert to `8050090300`.

### Expected result

```text
/auth + 8050000300      -> /admin
/mlm-login + 8050000300 -> /mlm-admin
/direct /driver-app     -> allowed
/direct /member-app     -> allowed
/direct /customer-app   -> allowed
```

No MSG91 template changes are needed for this request.
