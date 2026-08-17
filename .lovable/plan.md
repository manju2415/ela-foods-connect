# Fix mobile stability, onboarding, invoices, addresses, alerts, and stock control

## Confirmed current state
- Sathish has a ₹4,000 withdrawable wallet balance, but his `registration_fee_paid` remains ₹0 and there is no registration payment log. A wallet adjustment is intentionally not proof of registration payment, so the payment gate continues to appear.
- Admin already has a separate **Record Registration Payment** action. The correction is to record Sathish’s captured payment through that flow, not reinterpret wallet credit as payment.
- Member/customer APK screens automatically request notification permission and immediately register for push after approval. The app already documents Android WebView exits from early push initialization and has disabled the same behavior in the driver app.
- The native header relies on CSS safe-area values, while the status bar configuration does not explicitly prevent WebView overlap. This allows the cart/header controls to sit under the phone status icons on affected devices.
- Saved addresses support multiple records in the database and desktop dashboard, and checkout has an add-address dialog; the mobile Profile “My Addresses” link currently opens Orders instead of an address screen.
- Authenticated and guest order creation currently happen in separate multi-step client/function flows. Neither path atomically validates and reserves stock before creating the order, so stale/out-of-stock items can be purchased.
- New orders do not currently fan out an in-app/push alert to admins and the relevant pickup store staff.
- No registration or product-order invoice record/download flow currently exists.

## Implementation plan

### 1. Correct Sathish’s registration state
- Use the existing admin registration-payment operation for Sathish with the actual captured amount and Razorpay reference supplied/confirmed by the admin record.
- This will set `registration_fee_paid`, activate membership, release any pending referral processing idempotently, and remove the payment gate on next status refresh/login.
- Keep his existing ₹4,000 manual wallet adjustment unchanged unless it is separately determined to be an accidental duplicate; wallet credit and payment capture remain separate accounting events.
- Improve the admin dialog/status text so a wallet adjustment cannot be mistaken for a registration payment and show whether registration is paid.

### 2. Make onboarding strictly role-aware
- Centralize onboarding eligibility so `delivery_partner`, admin, and MLM-admin roles always bypass member profile/payment requirements across the global gate, auth redirect, customer/member shells, and deep links.
- Route delivery partners directly to the driver app after login.
- Preserve mandatory profile + registration payment for ordinary members and founding members.
- Add regression checks for users with multiple roles so delivery partners are not accidentally caught by a member role.

### 3. Stop the APK notification-permission crash
- Remove automatic permission prompts from member/customer screen mount.
- Add an explicit, user-initiated “Enable notifications” control after the app is stable; request permission only from that action.
- Separate permission request from push registration, guard plugin availability, add listener cleanup, prevent duplicate registration, and defer registration after approval/resume.
- Keep the driver app’s current safe behavior until the shared flow is verified on Android.
- Update native build requirements for Android notification permission, Firebase configuration, and a clean `cap sync`/APK rebuild; verify denied, allowed, and already-allowed states.

### 4. Fix product-page scroll and native safe areas
- Preserve the current scroll position when cart state refreshes after Add to Cart; do not focus, navigate, or remount the product list as a side effect.
- Remove nested interactive/link behavior that can cause product-card actions to trigger parent navigation or browser scroll restoration.
- Configure the native status bar not to overlay the WebView and apply one safe-area-aware header offset (without double padding) to the app shell/header.
- Verify the cart badge, notification icon, and menu remain below phone status/signal icons on Android cutout and non-cutout screens.

### 5. Add GST invoices
- Add immutable invoice records with unique invoice numbers, customer details, payment reference/method, taxable value, CGST/SGST or IGST breakdown, total, and source reference.
- **Registration invoice:** issue after online payment succeeds and after an admin manually records a captured payment. The entered registration amount is treated as GST-inclusive at 18%, with taxable value and GST derived from the total.
- **Product-order invoice:** issue only after a product order is successfully placed/paid according to its payment method; include item quantities, HSN, GST rates, discounts, shipping, wallet usage, and payment status.
- Add customer/member invoice download/print actions and admin invoice access from registration payment and order details.
- Make invoice creation idempotent so retries cannot produce duplicate invoice numbers.

### 6. Expose multiple delivery addresses in the mobile app
- Add a dedicated mobile **My Addresses** route using the existing address CRUD behavior.
- Correct the Profile link, support add/edit/delete/default address, and make the checkout selector refresh and select a newly added address.
- Keep address ownership enforced by existing user-scoped access rules and improve mobile dialog sizing/validation.

### 7. Notify operations about every new order
- Add a backend new-order notification fan-out after a valid order is committed.
- Notify super admins/admins and, for store pickup, the assigned store staff; include order number, customer, fulfillment method, amount, order status, and payment status.
- Create in-app notifications even when a recipient has no device token, and send push only to valid registered tokens.
- Link notifications to the admin/store order-detail view and cover authenticated, guest, wallet, COD, and online-payment paths without duplicates.

### 8. Make stock validation atomic
- Replace direct multi-step order inserts with a backend order-placement transaction/RPC that locks the requested product/variant/store-inventory rows, validates active status and requested quantity, deducts stock, creates the order/items, and commits together.
- Recalculate authoritative prices, discounts, shipping, wallet use, and totals on the backend; do not trust client totals.
- Use the same stock-reservation core for authenticated and guest checkout, including variants and store pickup inventory.
- Return a clear “quantity changed/out of stock” response, refresh the cart, and never create an order or capture payment when stock validation fails.
- Restore stock exactly once when an order is cancelled before fulfillment; prevent negative stock and duplicate deductions with idempotency constraints.
- Also block Add to Cart/quantity increases using current stock for immediate feedback, while retaining backend validation as the final authority.

### 9. Order detail and payment visibility
- Standardize customer, admin, and store order details to show item totals, wallet amount, payable amount, payment method, payment status, fulfillment status, delivery/pickup address, and invoice action.
- Ensure fully wallet-paid orders show `completed`, COD shows the outstanding COD amount, and online orders change to paid only after verified success.

## Database and security details
- Add invoice tables/number generation with explicit grants, row-level access for owners, and admin/store access through server-validated roles.
- Add one security-definer transactional order-placement function with fixed `search_path`, authenticated identity checks, validated quantities/IDs, row locks, and idempotency keys.
- Keep role decisions in `user_roles`; do not use client storage for authorization.
- Use backend triggers/functions for invoice issuance and order alerts so direct or retried clients cannot bypass them.

## Verification
- Verify Sathish no longer sees registration payment after the admin record is applied and that his wallet remains separately auditable.
- Test member, founder, delivery partner, admin, and mixed-role login/deep-link routing.
- Build/sync an Android APK and test notification permission allow/deny, relaunch, status-bar spacing, and Add to Cart scroll position on a physical device.
- Test multiple addresses and new-address selection on mobile.
- Race two checkouts against the last unit of stock; exactly one must succeed.
- Test product and variant stock, store pickup inventory, guest/member checkout, wallet/COD/online payment, cancellation restock, admin/store alerts, and one invoice per source transaction.
