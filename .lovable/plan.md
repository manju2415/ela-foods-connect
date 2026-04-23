
## Plan: Replace admin login number and keep login paths separate

### What will change

1. **Remove `9108682966` as an admin number**
   - Remove it from the current `handle_new_user` role assignment logic.
   - Remove any existing `super_admin`, `admin`, and `mlm_admin` roles attached to users whose profile phone is:
     - `9108682966`
     - `09108682966`
     - `919108682966`
     - `+919108682966`

2. **Add `8050090300` as the new admin number**
   - Update backend role assignment so new signups/logins for:
     - `8050090300`
     - `918050090300`
     - `+918050090300`
   - receive admin access.

3. **Make `/auth` login go to `/admin` for `8050090300`**
   - Assign `super_admin` to `8050090300`.
   - Because `/auth` already redirects super admins to `/admin`, this will make the login flow work as requested:
     ```text
     /auth + 8050090300 login -> /admin
     ```

4. **Keep `/mlm-login` separate**
   - I will not make `8050090300` an `mlm_admin`.
   - So if the same number logs in from `/mlm-login`, it will remain on the MLM login flow and show access denied instead of entering MLM admin:
     ```text
     /mlm-login + 8050090300 login -> stays/returns to /mlm-login
     ```
   - This matches your wording: `/auth` should open `/admin`, while `/mlm-login` should remain `/mlm-login`.

### Technical details

- Create a backend migration to replace the current phone mapping in `public.handle_new_user()`.
- Use data update SQL to:
  - remove privileged roles from the old `9108682966` account(s),
  - add `super_admin` to existing user profile(s) for `8050090300` if already present.
- Update project memory for the new real admin number so it is not accidentally reverted later.
- No MSG91 template changes are needed for this request.
- No direct edits will be made to generated backend client/type files.
