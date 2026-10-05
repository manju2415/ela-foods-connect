-- Add the Privacy Policy to site_policies so /policies/privacy (and the
-- /privacy-policy redirect used by Play Store / App Store / Razorpay) has content.
-- ON CONFLICT DO NOTHING: never overwrites a privacy row an admin may already
-- have created/edited, and does not touch return/cancellation/refund rows.
INSERT INTO public.site_policies (policy_type, title, content, is_active)
VALUES ('privacy', 'Privacy Policy', $pp$## Privacy Policy

This Privacy Policy explains how ELA FOODS AND SNACKS PRIVATE LIMITED ("Ela Bazar", "we", "us") collects, uses, shares and protects your personal information when you use the Ela Bazar website and mobile apps. By using our services, you agree to the practices described here.

### Information We Collect
- Account information: your name, mobile number, email address (if provided) and referral details when you register
- Delivery information: delivery addresses, pincode and location details you provide so we can deliver your orders
- Order history: products purchased, order amounts, payment status, returns, cancellations and refunds
- Wallet and referral information: wallet balance, referral earnings, and the bank account or UPI details you provide for withdrawals
- Device data: device type, operating system, app version, IP address, browser type and basic usage logs used to keep the service secure and working

### How We Use Your Information
- To process, deliver and track your orders, returns and refunds
- To verify your identity through OTP (one-time password) authentication on your mobile number
- To manage your wallet, referral rewards and withdrawal requests
- To provide customer support and respond to your requests
- To send order updates and, where you have opted in, offers and newsletters
- To prevent fraud, misuse and unauthorised access, and to comply with legal obligations

### Payment Gateway
- Online payments are processed by Razorpay, our third-party payment gateway
- Your card, UPI, net banking and wallet credentials are entered on and handled securely by Razorpay
- We do not collect or store your full card number, CVV, UPI PIN or banking passwords
- We only receive payment confirmation details such as the transaction ID, amount and payment status

### Data Sharing
- We share delivery details (name, phone number and address) only with our logistics and delivery partners to fulfil your orders
- We share information with payment partners only as needed to complete your transactions
- We may disclose information to government or law enforcement authorities when required by law or a valid legal process
- We do not sell, rent or trade your personal information to anyone

### Data Security
- Data is transmitted over encrypted (HTTPS) connections
- Access to personal data is restricted to authorised personnel who need it to operate our services
- We use secure, access-controlled cloud infrastructure to store your data
- While we take reasonable measures to protect your data, no method of transmission or storage over the internet is completely secure

### Data Retention
- We keep your information for as long as your account is active or as needed to provide our services
- Order, invoice and payment records may be retained for the period required under applicable tax and accounting laws

### Your Rights and Account Deletion
- You can view and update your profile and delivery addresses from your account
- You can unsubscribe from promotional messages at any time
- You can request deletion of your account and associated personal data from the Account Deletion page at /account-deletion
- Some records may be retained after deletion where required by law (for example, invoices and tax records)

### Children's Privacy
- Our services are intended for users aged 18 years and above. We do not knowingly collect personal data from children

### Changes to This Policy
- We may update this Privacy Policy from time to time. The updated version will be posted on this page and applies from the date it is published

### Grievance Officer
In accordance with the Information Technology Act, 2000 and the rules made under it, and the Digital Personal Data Protection Act, 2023, you may contact our Grievance Officer with any questions or complaints about your personal data:

- Grievance Officer, ELA FOODS AND SNACKS PRIVATE LIMITED
- Address: No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore, Karnataka 560090
- Phone: +918747003999
- Email: elasnacks@gmail.com
- We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days of receipt$pp$, true)
ON CONFLICT (policy_type) DO NOTHING;
