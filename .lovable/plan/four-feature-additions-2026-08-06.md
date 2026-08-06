# Four Feature Additions

Additive only — no refactor of existing flows. Reuses the existing Razorpay gateway, `product_variants`, and `mlm_settings`.

## 1. Founder registration fee + approval-then-payment

Flow (confirmed): user registers as a normal member → Super Admin marks them as a Founding Member candidate → status becomes "Approved – Payment Pending" → user pays the founder fee on the Founding Member route → on success status becomes "Active Founding Member" and the payment is logged.

- New `founder_status` on profiles: `none` / `approved_pending_payment` / `active`.
- Super Admin (`/admin/founders`): an **Approve as Founding Member** action that sets status to Approved – Payment Pending, plus a status column. No payment action for admins.
- Admin settings: editable **Founder Registration Fee** (total + wallet credit) — the existing `founder_registration_fee` setting in MLM Settings gets a clearer labelled card; no new settings store.
- Founding Member route (`/registration-payment`, founder mode): shows one of Pending Approval / Pay Now / Paid, and pays the configured founder fee through Razorpay.
- New **founder payment log** table (user, amount, payment id, order id, status, date) written by the payment edge function, and a read-only log view for Super Admin.

## 2. HSN code + GSTN filing report

- `hsn_code` added to products (required in Add/Edit Product, validated 4–8 digits, numeric only), shown as a column in the admin product list. `gst_percentage` already exists and is reused.
- New **GSTN Filing Report** page under the admin Reports/Analytics area: date range → rows grouped by HSN code showing products included, quantity, taxable value, GST rate, CGST/SGST split, total tax and total value, with grand totals.
- Counts **paid orders only** (`payment_status = completed`) in the range.
- CSV export (Excel-compatible) of the same table.

## 3. MLM settings versioning

- New `mlm_settings_versions` table: each save of MLM settings inserts a new version row (full settings snapshot + `effective_from` + who changed it) instead of only overwriting. History is browsable in MLM Settings.
- New `mlm_settings_version_id` on profiles, stamped at registration with the version active at that moment.
- Commission/wallet functions (`process_mlm_referral`, `credit_founder_commission`, `credit_purchase_commission`) read the snapshot tied to the earning user's version, falling back to the current settings only when a user has no version stamp (existing users get stamped with the initial version at migration time).
- Result: changing settings never alters existing users' earning rules or past balances; only newer registrations use the new version.

## 4. Product quantity/variant dropdown (customer side)

Confirmed scope: **both** grouping mechanisms.

- Product listing and product detail group products that share the same name (and category) into a single card, and merge their `product_variants` into one dropdown.
- Dropdown options show label + price; selecting one updates displayed price, member price, stock status and the Add to Cart / Buy Now target so the correct product id + variant id + price are used.
- Cart, checkout and order history display the selected variant label (order items already store `variant_id` and `variant_label`; the listing/cart UI will show it consistently) so HSN/GST reporting stays accurate.

## Technical notes

- Migrations: `profiles.founder_status`, `profiles.mlm_settings_version_id`, `products.hsn_code`, new `founder_payment_logs` and `mlm_settings_versions` tables (with GRANTs + RLS: users read their own payment logs, admins read all; settings versions readable by admins, writable by MLM admin).
- Edge function `process-registration-payment` extended to require `founder_status = approved_pending_payment` for the founder fee, write the payment log row, and set status to active.
- Frontend touches: `admin/Founders.tsx`, `admin/MLMSettings.tsx`, `admin/Products.tsx`, `admin/AdminSidebar.tsx`, `RegistrationPayment.tsx`, `Products.tsx`, `ProductDetail.tsx`, `ProductCard.tsx`, plus two new admin pages (GSTN report, founder payment log).
- Assumption: grouping key for duplicate products is exact product name within the same category; GST split assumes intra-state CGST/SGST halves.
- Finish with a production build check.
