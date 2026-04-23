
## Plan: Make `8050000300` Super Admin + Network Manager only

### What will change

1. **Keep `8050000300` as the main Super Admin login**
   - Supported formats:
     ```text
     8050000300
     918050000300
     +918050000300
     ```
   - This number will keep `super_admin` access.
   - When logging in through `/auth`, it will go to:
     ```text
     /admin
     ```

2. **Keep `8050000300` as Network Manager**
   - This number will also keep `mlm_admin` access.
   - When logging in through `/mlm-login`, it will go to:
     ```text
     /mlm-admin
     ```

3. **Remove the extra roles from this number**
   - I will remove the previously added roles that are no longer wanted:
     ```text
     member
     delivery_partner
     ```
   - I will also remove its delivery partner record, so it does not behave like a driver account.

4. **Update future auto-role assignment**
   - The backend signup/login role assignment will be updated so `8050000300` automatically receives only:
     ```text
     super_admin
     mlm_admin
     ```
   - It will no longer automatically receive:
     ```text
     member
     delivery_partner
     ```

5. **Ensure app OTP login defaults to Super Admin**
   - The OTP login flow in `/auth` already prioritizes Super Admin above MLM Admin.
   - I will keep/verify that priority so this happens:
     ```text
     App OTP login / /auth + 8050000300 -> /admin
     ```
   - This means the number will land in the Super Admin dashboard by default and see all Super Admin modules, including the integrated Network Admin section.

6. **Keep Network Manager login separate**
   - If the same number is used on `/mlm-login`, it will still enter the standalone Network Manager dashboard:
     ```text
     /mlm-login + 8050000300 -> /mlm-admin
     ```

### Technical details

- Update the backend `handle_new_user()` function so the all-access behavior is removed for `8050000300`.
- Run data updates to:
  - delete `member` and `delivery_partner` roles for the `8050000300` account,
  - keep `super_admin` and `mlm_admin`,
  - delete any `delivery_partners` record for this user.
- Review `/auth` redirect logic to ensure Super Admin stays highest priority and lands on `/admin`.
- Update project memory so future changes remember:
  ```text
  8050000300 = Super Admin + Network Manager only
  ```

### Expected result

```text
/auth + 8050000300      -> /admin
/mlm-login + 8050000300 -> /mlm-admin

/admin                  -> allowed
/admin/network-admin    -> allowed
/mlm-admin              -> allowed

/driver-app             -> not treated as this user's default role
/member-app             -> not treated as this user's default role
```
