# GSTN Report: registration + sales invoices in one filing report

Builds the report described in the uploaded requirements document, plus the invoice-numbering and HSN changes you confirmed.

## 1. New invoice numbering: R001 / S001

Invoices are numbered `REG20260828-000012` and `INV20260818-000001` today. Switching to the simple scheme:

- Registration invoices: `R001`, `R002`, ... in payment-date order.
- Sales/order invoices: `S001`, `S002`, ... in order-date order.
- Two independent counters, no date embedded, never reused.
- The 41 invoices already issued (34 sales, 7 registration) are renumbered in date order, so the sequence has no gaps. Their old numbers are kept in a reference field in case a customer quotes one.
- Invoice PDFs, the invoice dialog and the admin/customer screens automatically show the new number.

## 2. Registration charge: HSN 9983

- Registration invoices currently carry SAC `999799`. This becomes `9983` at 18%, GST-inclusive.
- The 7 existing registration invoices are corrected to `9983` as well. Amounts and the GST split are unchanged, because the 18% inclusive split is already what they use (e.g. ₹3,999 → base ₹3,388.98, CGST ₹305.01, SGST ₹305.01).
- Invoice date stays the payment date, as required.

## 3. CGST/SGST vs IGST by state

- Company place of supply: Karnataka. A customer whose billing state is outside Karnataka is billed IGST 18%; inside Karnataka, CGST 9% + SGST 9%.
- Registration invoices carry no address state today, so when the state is unknown the invoice falls back to intra-state (CGST+SGST) — same as now. Where the member has a saved address, its state is used.
- Sales invoices already record a state, so they split correctly straight away.

## 4. The GSTN report itself

Replaces the current HSN-summary-only page at Admin > GST Report:

- Date range picker (IST calendar days, as today).
- **Invoice register** tab — one row per invoice line, exactly the document's format: Invoice No., Date, Item Details, HSN Code, Taxable Value, GST rate, CGST/SGST/IGST, Amount. Registration and sales invoices appear together, sorted by date, `R...` and `S...` interleaved.
  - Sales invoices produce one line per product HSN inside the invoice; registration invoices produce one line ("User Registration Charge", HSN 9983).
- **HSN summary** tab — the existing rate-wise/HSN-wise totals, now including registration charges.
- Totals row and CSV/Excel export for both tabs, filename carrying the period.
- Only paid, non-cancelled invoices are counted.

## Technical notes

- Migration: `next_invoice_number()` returns `R`/`S` + zero-padded counter from two new sequences; add `legacy_invoice_number` to `invoices`; backfill/renumber existing rows in date order and seed the sequences past the highest issued number.
- Migration: `issue_registration_invoice()` uses HSN `9983`; both `issue_registration_invoice()` and `issue_order_invoice()` decide CGST+SGST vs IGST from the billing state against a Karnataka constant, defaulting to intra-state when state is absent. Data update corrects the 7 existing registration invoice `items[].hsn_sac`.
- `src/pages/admin/GSTReport.tsx` rewritten to read `public.invoices` (payment_status paid) instead of `order_items`, flattening `items` jsonb into report lines; keeps the two-tab layout and the existing CSV exporter shape.
- `src/components/InvoiceButton.tsx` needs no change; it renders whatever `invoice_number` holds.
- Nothing touches orders, wallets, balances, pricing or payment logic — only invoice presentation, HSN/GST split fields, and the report page.
