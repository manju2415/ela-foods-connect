# Full data export for the MongoDB / Node migration

Goal: one downloadable ZIP containing every row of your data, the user account list, and all uploaded images, in a shape that is easy to load into MongoDB.

## What the ZIP will contain

```text
elabazar-export-<date>/
  data/                 one .json file per table (array of records)
    products.json
    orders.json
    order_items.json
    profiles.json
    wallets.json
    wallet_transactions.json
    ... (all 45 tables)
  auth/
    users.json          account list: id, email, phone, created, confirmed, last sign-in
                        (passwords can never be exported - they are one-way encrypted)
  storage/
    files/...           every uploaded image/file, in its original folders
    inventory.json      list of files with path, size, type, public URL
  schema/
    tables.json         columns, types, required fields, relationships per table
    enums.json          allowed values (order status, roles, etc.)
  README.md             row counts per table, how the files map to Mongo collections
  MIGRATION-NOTES.md    which id fields link to which table, so relations survive
```

## How it will be produced

1. List every table in the app database and export each one as a JSON array, in full - no row limits, no sampling.
2. Export the account list from the authentication store (no password material - that cannot leave the system by design).
3. List every storage bucket, download each file, and keep the original folder paths.
4. Dump column types, required fields, defaults, relationships and the allowed-value lists so the Node/Mongo side can rebuild validation.
5. Add row counts and a short mapping note for each table.
6. Zip everything and hand you the file to download.

## Important notes

- The export is read-only. Nothing in the live database or storage is changed, and no orders, wallets, or accounts are touched.
- Rows with sensitive fields (bank account numbers, phone numbers, addresses) are included in full, since this is your own backup. Store the ZIP securely.
- Database logic that currently lives inside the database - order placement, wallet credits, referral and commission rules, invoice numbering, access rules - is **not** data and will not come across in the ZIP. It has to be rewritten in Node. I can produce a separate written specification of those rules if you want it as part of this step.
- If the total image size is very large, images will be split into a second ZIP so each download stays manageable.

## Technical details

- Per-table JSON is produced with row-to-JSON queries against the connected database (full table scans, streamed to file), not a binary dump.
- Storage files are fetched over the storage API bucket by bucket, preserving `bucket/path/filename`.
- Schema output is read from `information_schema` plus enum catalogs.
- Output is written under `/mnt/documents/` and zipped there for download.
