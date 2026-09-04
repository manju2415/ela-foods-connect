# Recent project changes

## Goal

Provide a concise, high-level list of the latest changes made to the project.

## Approach

1. Review the recent git history and the last several conversation turns.
2. Summarize the changes into short, user-readable bullet points grouped by impact.
3. Present the list to the user. No code or database changes are required.

## Recent changes (concise bullets)

- **Cart navigation** — added a "Back to Products" header button, made "Continue Shopping" more visible, and added safe-area bottom padding for mobile.
- **Member app shopping** — added a "Shop" tab to the member bottom nav and a "Browse Products" button on the member Dashboard.
- **Guest checkout** — removed COD for guests; the order is created only after Razorpay payment is verified.
- **Registration/onboarding** — removed bank-account fields from signup; profile completion now relies on the user agreement. Existing users were backfilled.
- **Invoices** — auto-generate 18% GST invoices for product orders and the ₹4,999 founder registration fee, with Print and PDF download options.
- **Wallet & referrals** — wallets are auto-created when missing, wallet payment is deducted atomically at checkout, and referral/commission payouts are triggered on member activation.
- **MLM settings** — added enable/disable toggle for purchase commissions, HSN/GSTN report, settings versioning, and withdrawable founder credits.
- **Products & inventory** — added product quantity variants, enforced stock validation during checkout, and made the Add to Cart button always visible.
- **Network tree** — made member names responsive on mobile and added a tap-to-preview sheet for downline details.
- **Admin** — responsive admin tables, wallet-balance columns in the user list, and coupon audience controls (first order / all orders / members / non-members).
- **Auth & roles** — super admin number migrated to 8050000300, invite-only login restricted to the mobile app, and founding members seeded.
- **App stability** — deferred push-notification permission prompt, fixed status-bar safe-area overlap, and added native contact picker for "Invite Friends & Family".
- **UI polish** — updated phone-input placeholders, fixed hero image desktop sizing, and corrected small text/punctuation issues.
