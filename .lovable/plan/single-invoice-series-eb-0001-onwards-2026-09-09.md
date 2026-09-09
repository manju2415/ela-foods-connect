# Single invoice series: EB-0001 onwards

Replace the split R.../S... numbering with one continuous series used by both registration and sales invoices.

## What changes

- Every invoice — registration or sale — gets a number from one shared counter: `EB-0001`, `EB-0002`, `EB-0003`, ...
- All 41 invoices already issued are renumbered in strict payment-date order, mixed together. So:
  - `EB-0001` = the 18 Aug sale (9900475932)
  - your 26 Aug order (9448493280) lands at roughly `EB-0010`
  - Ramesh PK's 28 Aug registration falls in the same run, at its own date position
  - the newest one, Pramod kumar's registration recorded today at 19:44, gets the last number
- The invoice date stays the payment date, exactly as it is now.
- The old numbers (`INV20260818-000001`, `REG20260828-000012`, ...) stay stored in the reference field, so a customer quoting an old number can still be traced.
- Future invoices continue from the last used number, never reusing one.

## Today's failed callback

Checked the live data: the registration you adjusted manually (Pramod kumar, 9986423390, ₹3,999) is recorded as successful and already has an invoice, so nothing is missing there. No payment attempt rows exist for the last two days, which is why no automatic invoice was produced — the manual entry covered it correctly. Three small orders on 8 Sept are marked failed and cancelled and correctly carry no invoice.

## Impact review — what could break

Reviewed every place the invoice number is used:

- Invoice PDF/print and the invoice dialog only print whatever number is stored — no change needed.
- The GST report reads the number as text and sorts by date — no change needed apart from the wording that says "Registration (R) and sales (S)".
- No code anywhere parses, prefixes or filters on `R`/`S`/`INV`/`REG`, so nothing depends on the old shape.
- Orders, wallets, balances, referrals, registration payments, pricing and stock are untouched.

The only behavioural change is the text of the invoice number.

## Technical notes

- Migration: add sequence `invoice_number_eb_seq`; `next_invoice_number(p_type)` ignores the type and returns `'EB-' || lpad(nextval(...)::text, 4, '0')`. The two `R`/`S` sequences are left in place unused.
- Data update: renumber all existing rows ordered by `issued_at` with a `row_number()` CTE, preserving `legacy_invoice_number` as already backfilled (rows keep the original `INV.../REG...` value; the current `R...`/`S...` values are discarded since the legacy column already holds the originals). Then `setval` the new sequence to the highest number used.
- `issue_order_invoice()` and `issue_registration_invoice()` need no change — both call `next_invoice_number()`.
- `src/pages/admin/GSTReport.tsx`: update the register subtitle to "Registration and sales invoices, in date order". No logic change.
