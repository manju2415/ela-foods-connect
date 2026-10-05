# Complete backend export: everything needed to rebuild on Node + MongoDB

Goal: hand you a download containing every single thing the current backend holds and does, so the site and app can behave exactly as they do today after the move.

## Part 1 - All data

```text
data/                   one .json file per table, complete, no row limits
  products.json, product_variants.json, categories.json
  orders.json, order_items.json, order_status_history.json, order_assignments.json
  profiles.json, user_roles.json, referrals.json, referral_codes.json
  wallets.json, wallet_transactions.json, withdrawal_requests.json
  invoices.json, founder_payment_logs.json, payment_attempts.json
  addresses.json, cart_items.json, wishlist.json, coupons.json
  stores.json, store_inventory.json, store_staff.json, delivery_partners.json
  banners.json, advertisements.json, testimonials.json, product_reviews.json
  mlm_settings.json, mlm_settings_versions.json, platform_settings.json
  site_policies.json, delivery_time_slots.json, notifications.json
  ... every remaining table, nothing skipped
auth/users.json         every account: id, email, phone, metadata, confirmed,
                        created, last sign-in (password hashes cannot be exported -
                        users sign in by OTP anyway, so this does not break login)
```

## Part 2 - All files

```text
storage/files/...       every uploaded image and file, original folder structure
storage/inventory.json  path, bucket, size, type, public URL for each file
```

## Part 3 - All behaviour (the part that makes it behave the same)

Most of your business rules currently live inside the database, not in the app. These are exported as readable source plus a written specification so they can be rebuilt in Node:

```text
logic/
  functions.sql         every database function, full source (order placement,
                        wallet credits, referral & founder commission, invoice
                        numbering EB-0001, stock deduction/restore, withdrawals,
                        network tree, dashboards - ~70 functions)
  triggers.sql          every trigger and what fires it
  policies.sql          every access rule per table (who can read/write what)
  schema.sql            tables, columns, types, defaults, indexes, relationships
  enums.json            allowed values (order status, roles, levels, reasons)
  SPEC.md               each rule written out in plain terms: inputs, outputs,
                        order of steps, edge cases - the build sheet for Node
edge-functions/         copy of all server functions already in your codebase
                        (OTP login, signup, Razorpay create/verify/webhook,
                        guest orders, push, invoices, recovery) with the list of
                        secrets each one needs
```

## Part 4 - Migration aids

```text
README.md               row counts per table, what maps to which Mongo collection
RELATIONS.md            which id field points to which table, so links survive
mongo-import/           ready-to-run import script + suggested collection shapes
                        and indexes for Mongo
CHECKLIST.md            what to verify after import (counts, balances, totals)
```

## Delivery

- One ZIP for data + logic, a second ZIP for images if the file size is large.
- Everything is read-only: no orders, wallets, accounts, stock, or files are modified.
- Full sensitive data (bank details, phones, addresses) is included since it is your own backup - keep the ZIP secure.

## What cannot come across

- Password hashes and the service key stay inside the current system. Login is OTP-based, so accounts still work after migration.
- Scheduled jobs and provider settings (payment keys, SMS keys) must be re-entered on the new host; they are listed in the checklist, without their values.

## Technical details

- Per-table JSON via full-table row-to-JSON queries, streamed to disk.
- Function/trigger/policy source read from the catalog (`pg_proc`, `pg_trigger`, `pg_policies`, `information_schema`).
- Storage pulled bucket-by-bucket over the storage API, preserving `bucket/path/name`.
- Output written to `/mnt/documents/` and zipped for download.
