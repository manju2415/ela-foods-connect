-- Update the Privacy Policy text to match the audited app behaviour for App
-- Store review (no tracking/ads/analytics SDKs, no device location, contact
-- picker disclosure, service providers, full account-deletion URL).
-- Only touches the privacy row; return/cancellation/refund are untouched.
UPDATE public.site_policies
SET content = $pp$## Privacy Policy

This Privacy Policy explains how ELA FOODS AND SNACKS PRIVATE LIMITED ("Ela Bazar", "we", "us") collects, uses, shares and protects your personal information when you use the Ela Bazar website (https://elabazar.com) and the Ela Bazar mobile apps. By using our services, you agree to the practices described here.

### Information We Collect
- Account information: your name, mobile number, email address (if you provide one), user ID and referral details when you register
- Delivery information: the delivery addresses and pincode you enter so we can deliver your orders
- Order and purchase history: products purchased, order amounts, payment status, returns, cancellations and refunds
- Wallet and referral information: wallet balance, wallet transactions, referral and network details, and referral earnings
- Withdrawal details: the bank account holder name, account number and IFSC code you provide to receive wallet withdrawals
- Payment records: transaction ID, amount and status received from our payment gateway (we do not receive your card or UPI credentials)
- Push notification token: a token issued by your device so we can send you order and account notifications, if you allow notifications
- Technical and security logs: IP address and request logs recorded by our hosting and authentication infrastructure to keep the service secure and working
- Newsletter: your email address, if you subscribe to our newsletter

### Location
- The Ela Bazar app does not access your device's GPS or location services
- Delivery is based only on the address and pincode you type in

### Phone Contacts
- Members can choose to add a new member by picking a person from their phone contacts. This happens only when you tap the option and allow contacts permission
- When you open the contact picker, the phone numbers in your contact list are sent securely to our server only to show which contacts are already registered. These numbers are not stored and are not used for any other purpose
- Only the contact you choose to add (name and mobile number) is saved, as part of the new member's registration
- You can deny or withdraw contacts permission at any time in your phone settings and enter numbers manually instead

### How We Use Your Information
- To create and manage your account
- To verify your identity through OTP (one-time password) sent by SMS to your mobile number
- To process, deliver and track your orders, returns, cancellations and refunds
- To manage your wallet, referral rewards and withdrawal requests
- To send notifications about your orders and account through push notifications, SMS and email
- To send newsletters and offers only where you have subscribed
- To provide customer support and respond to your requests
- To prevent fraud, misuse and unauthorised access, and to comply with legal, tax and accounting obligations

### Order Delivery
- Your name, phone number and delivery address are shared with the delivery partner assigned to your order
- Delivery partners may open your address in a maps application for navigation
- Delivery partners may take a photo of the delivered package as proof of delivery

### Payment Gateway
- Online payments are processed by Razorpay, our third-party payment gateway
- Your card, UPI, net banking and wallet credentials are entered on and handled securely by Razorpay under its own privacy policy
- We do not collect or store your full card number, CVV, UPI PIN or banking passwords
- We only receive payment confirmation details such as the transaction ID, amount and payment status

### Third-Party Service Providers
We use the following service providers only to operate the service. They process data on our behalf and are not permitted to use it for their own purposes:
- Supabase: database, user authentication, file storage and server hosting
- Razorpay: payment processing and bank IFSC verification
- MSG91: sending OTP SMS messages
- Google Firebase Cloud Messaging: delivering push notifications
- Resend: sending order confirmation emails

### Tracking and Advertising
Ela Bazar does not track users across apps or websites owned by other companies for advertising purposes. We do not sell personal information to data brokers and do not use personal information for cross-app or cross-website tracking.
- The app does not contain advertising, analytics, attribution or crash-reporting SDKs
- We do not access your device's advertising identifier (IDFA)

### Data Sharing
- With delivery partners, only as needed to deliver your orders
- With the service providers listed above, only as needed to run the service
- With government or law enforcement authorities when required by law or a valid legal process
- We do not sell, rent or trade your personal information to anyone

### Data Security
- Data is transmitted over encrypted (HTTPS) connections
- Access to personal data is restricted to authorised personnel who need it to operate our services
- Our database enforces access rules so that users can only access their own account data
- While we take reasonable measures to protect your data, no method of transmission or storage over the internet is completely secure

### Data Retention
- We keep your information for as long as your account is active or as needed to provide our services
- Order, invoice, payment and wallet records may be retained for the period required under applicable tax and accounting laws, even after account deletion
- Contact phone numbers checked through the contact picker are not stored

### Account and Data Deletion
- In the app: open Profile and tap Request Account Deletion
- On the web: submit a request at https://elabazar.com/account-deletion
- You can also email elasnacks@gmail.com from your registered email address or call +918747003999
- We process deletion requests within 7 working days. Your account and associated personal data are deleted, except records we must keep by law (for example, invoices and tax records)

### Your Privacy Rights
- You can access and update your profile and delivery addresses from your account
- You can turn off push notifications in your device settings and unsubscribe from newsletters at any time
- You can withdraw contacts permission at any time in your device settings
- You can request a copy, correction or deletion of your personal data, or withdraw consent, by contacting our Grievance Officer below

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
- We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days of receipt$pp$,
    title = 'Privacy Policy',
    is_active = true,
    updated_at = now()
WHERE policy_type = 'privacy';

-- In case the earlier insert migration was never applied.
INSERT INTO public.site_policies (policy_type, title, content, is_active)
VALUES ('privacy', 'Privacy Policy', $pp$## Privacy Policy

This Privacy Policy explains how ELA FOODS AND SNACKS PRIVATE LIMITED ("Ela Bazar", "we", "us") collects, uses, shares and protects your personal information when you use the Ela Bazar website (https://elabazar.com) and the Ela Bazar mobile apps. By using our services, you agree to the practices described here.

### Information We Collect
- Account information: your name, mobile number, email address (if you provide one), user ID and referral details when you register
- Delivery information: the delivery addresses and pincode you enter so we can deliver your orders
- Order and purchase history: products purchased, order amounts, payment status, returns, cancellations and refunds
- Wallet and referral information: wallet balance, wallet transactions, referral and network details, and referral earnings
- Withdrawal details: the bank account holder name, account number and IFSC code you provide to receive wallet withdrawals
- Payment records: transaction ID, amount and status received from our payment gateway (we do not receive your card or UPI credentials)
- Push notification token: a token issued by your device so we can send you order and account notifications, if you allow notifications
- Technical and security logs: IP address and request logs recorded by our hosting and authentication infrastructure to keep the service secure and working
- Newsletter: your email address, if you subscribe to our newsletter

### Location
- The Ela Bazar app does not access your device's GPS or location services
- Delivery is based only on the address and pincode you type in

### Phone Contacts
- Members can choose to add a new member by picking a person from their phone contacts. This happens only when you tap the option and allow contacts permission
- When you open the contact picker, the phone numbers in your contact list are sent securely to our server only to show which contacts are already registered. These numbers are not stored and are not used for any other purpose
- Only the contact you choose to add (name and mobile number) is saved, as part of the new member's registration
- You can deny or withdraw contacts permission at any time in your phone settings and enter numbers manually instead

### How We Use Your Information
- To create and manage your account
- To verify your identity through OTP (one-time password) sent by SMS to your mobile number
- To process, deliver and track your orders, returns, cancellations and refunds
- To manage your wallet, referral rewards and withdrawal requests
- To send notifications about your orders and account through push notifications, SMS and email
- To send newsletters and offers only where you have subscribed
- To provide customer support and respond to your requests
- To prevent fraud, misuse and unauthorised access, and to comply with legal, tax and accounting obligations

### Order Delivery
- Your name, phone number and delivery address are shared with the delivery partner assigned to your order
- Delivery partners may open your address in a maps application for navigation
- Delivery partners may take a photo of the delivered package as proof of delivery

### Payment Gateway
- Online payments are processed by Razorpay, our third-party payment gateway
- Your card, UPI, net banking and wallet credentials are entered on and handled securely by Razorpay under its own privacy policy
- We do not collect or store your full card number, CVV, UPI PIN or banking passwords
- We only receive payment confirmation details such as the transaction ID, amount and payment status

### Third-Party Service Providers
We use the following service providers only to operate the service. They process data on our behalf and are not permitted to use it for their own purposes:
- Supabase: database, user authentication, file storage and server hosting
- Razorpay: payment processing and bank IFSC verification
- MSG91: sending OTP SMS messages
- Google Firebase Cloud Messaging: delivering push notifications
- Resend: sending order confirmation emails

### Tracking and Advertising
Ela Bazar does not track users across apps or websites owned by other companies for advertising purposes. We do not sell personal information to data brokers and do not use personal information for cross-app or cross-website tracking.
- The app does not contain advertising, analytics, attribution or crash-reporting SDKs
- We do not access your device's advertising identifier (IDFA)

### Data Sharing
- With delivery partners, only as needed to deliver your orders
- With the service providers listed above, only as needed to run the service
- With government or law enforcement authorities when required by law or a valid legal process
- We do not sell, rent or trade your personal information to anyone

### Data Security
- Data is transmitted over encrypted (HTTPS) connections
- Access to personal data is restricted to authorised personnel who need it to operate our services
- Our database enforces access rules so that users can only access their own account data
- While we take reasonable measures to protect your data, no method of transmission or storage over the internet is completely secure

### Data Retention
- We keep your information for as long as your account is active or as needed to provide our services
- Order, invoice, payment and wallet records may be retained for the period required under applicable tax and accounting laws, even after account deletion
- Contact phone numbers checked through the contact picker are not stored

### Account and Data Deletion
- In the app: open Profile and tap Request Account Deletion
- On the web: submit a request at https://elabazar.com/account-deletion
- You can also email elasnacks@gmail.com from your registered email address or call +918747003999
- We process deletion requests within 7 working days. Your account and associated personal data are deleted, except records we must keep by law (for example, invoices and tax records)

### Your Privacy Rights
- You can access and update your profile and delivery addresses from your account
- You can turn off push notifications in your device settings and unsubscribe from newsletters at any time
- You can withdraw contacts permission at any time in your device settings
- You can request a copy, correction or deletion of your personal data, or withdraw consent, by contacting our Grievance Officer below

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
