import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface Policy {
  id: string;
  policy_type: string;
  title: string;
  content: string;
  is_active: boolean;
}

// Fallback used when the DB has no active privacy row (e.g. before the
// migration is applied) so /policies/privacy and /privacy-policy always work.
const FALLBACK_PRIVACY_POLICY: Policy = {
  id: "4",
  policy_type: "privacy",
  title: "Privacy Policy",
  content: "## Privacy Policy\n\nThis Privacy Policy explains how ELA FOODS AND SNACKS PRIVATE LIMITED (\"Ela Bazar\", \"we\", \"us\") collects, uses, shares and protects your personal information when you use the Ela Bazar website (https://elabazar.com) and the Ela Bazar mobile apps. By using our services, you agree to the practices described here.\n\n### Information We Collect\n- Account information: your name, mobile number, email address (if you provide one), user ID and referral details when you register\n- Delivery information: the delivery addresses and pincode you enter so we can deliver your orders\n- Order and purchase history: products purchased, order amounts, payment status, returns, cancellations and refunds\n- Wallet and referral information: wallet balance, wallet transactions, referral and network details, and referral earnings\n- Withdrawal details: the bank account holder name, account number and IFSC code you provide to receive wallet withdrawals\n- Payment records: transaction ID, amount and status received from our payment gateway (we do not receive your card or UPI credentials)\n- Push notification token: a token issued by your device so we can send you order and account notifications, if you allow notifications\n- Technical and security logs: IP address and request logs recorded by our hosting and authentication infrastructure to keep the service secure and working\n- Newsletter: your email address, if you subscribe to our newsletter\n\n### Location\n- The Ela Bazar app does not access your device's GPS or location services\n- Delivery is based only on the address and pincode you type in\n\n### Phone Contacts\n- Members can choose to add a new member by picking a person from their phone contacts. This happens only when you tap the option and allow contacts permission\n- When you open the contact picker, the phone numbers in your contact list are sent securely to our server only to show which contacts are already registered. These numbers are not stored and are not used for any other purpose\n- Only the contact you choose to add (name and mobile number) is saved, as part of the new member's registration\n- You can deny or withdraw contacts permission at any time in your phone settings and enter numbers manually instead\n\n### How We Use Your Information\n- To create and manage your account\n- To verify your identity through OTP (one-time password) sent by SMS to your mobile number\n- To process, deliver and track your orders, returns, cancellations and refunds\n- To manage your wallet, referral rewards and withdrawal requests\n- To send notifications about your orders and account through push notifications, SMS and email\n- To send newsletters and offers only where you have subscribed\n- To provide customer support and respond to your requests\n- To prevent fraud, misuse and unauthorised access, and to comply with legal, tax and accounting obligations\n\n### Order Delivery\n- Your name, phone number and delivery address are shared with the delivery partner assigned to your order\n- Delivery partners may open your address in a maps application for navigation\n- Delivery partners may take a photo of the delivered package as proof of delivery\n\n### Payment Gateway\n- Online payments are processed by Razorpay, our third-party payment gateway\n- Your card, UPI, net banking and wallet credentials are entered on and handled securely by Razorpay under its own privacy policy\n- We do not collect or store your full card number, CVV, UPI PIN or banking passwords\n- We only receive payment confirmation details such as the transaction ID, amount and payment status\n\n### Third-Party Service Providers\nWe use the following service providers only to operate the service. They process data on our behalf and are not permitted to use it for their own purposes:\n- Supabase: database, user authentication, file storage and server hosting\n- Razorpay: payment processing and bank IFSC verification\n- MSG91: sending OTP SMS messages\n- Google Firebase Cloud Messaging: delivering push notifications\n- Resend: sending order confirmation emails\n\n### Tracking and Advertising\nEla Bazar does not track users across apps or websites owned by other companies for advertising purposes. We do not sell personal information to data brokers and do not use personal information for cross-app or cross-website tracking.\n- The app does not contain advertising, analytics, attribution or crash-reporting SDKs\n- We do not access your device's advertising identifier (IDFA)\n\n### Data Sharing\n- With delivery partners, only as needed to deliver your orders\n- With the service providers listed above, only as needed to run the service\n- With government or law enforcement authorities when required by law or a valid legal process\n- We do not sell, rent or trade your personal information to anyone\n\n### Data Security\n- Data is transmitted over encrypted (HTTPS) connections\n- Access to personal data is restricted to authorised personnel who need it to operate our services\n- Our database enforces access rules so that users can only access their own account data\n- While we take reasonable measures to protect your data, no method of transmission or storage over the internet is completely secure\n\n### Data Retention\n- We keep your information for as long as your account is active or as needed to provide our services\n- Order, invoice, payment and wallet records may be retained for the period required under applicable tax and accounting laws, even after account deletion\n- Contact phone numbers checked through the contact picker are not stored\n\n### Account and Data Deletion\n- In the app: open Profile and tap Request Account Deletion\n- On the web: submit a request at https://elabazar.com/account-deletion\n- You can also email elasnacks@gmail.com from your registered email address or call +918747003999\n- We process deletion requests within 7 working days. Your account and associated personal data are deleted, except records we must keep by law (for example, invoices and tax records)\n\n### Your Privacy Rights\n- You can access and update your profile and delivery addresses from your account\n- You can turn off push notifications in your device settings and unsubscribe from newsletters at any time\n- You can withdraw contacts permission at any time in your device settings\n- You can request a copy, correction or deletion of your personal data, or withdraw consent, by contacting our Grievance Officer below\n\n### Children's Privacy\n- Our services are intended for users aged 18 years and above. We do not knowingly collect personal data from children\n\n### Changes to This Policy\n- We may update this Privacy Policy from time to time. The updated version will be posted on this page and applies from the date it is published\n\n### Grievance Officer\nIn accordance with the Information Technology Act, 2000 and the rules made under it, and the Digital Personal Data Protection Act, 2023, you may contact our Grievance Officer with any questions or complaints about your personal data:\n\n- Grievance Officer, ELA FOODS AND SNACKS PRIVATE LIMITED\n- Address: No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore, Karnataka 560090\n- Phone: +918747003999\n- Email: elasnacks@gmail.com\n- We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days of receipt",
  is_active: true,
};

export default function Policies() {
  // The route is /policies/:slug — not :type.
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["public-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_policies")
        .select("*")
        .eq("is_active", true)
        .order("policy_type");
      
      if (error || !data || data.length === 0) {
        // Fallback defaults
        return [
          { id: "1", policy_type: "return", title: "Return Policy", content: "## Return Policy\n\n### Eligibility\n- Products must be returned within the specified return window\n- Items must be unused and in original packaging\n\n### Process\n1. Submit a return request from your order history\n2. Select pickup date and time slot\n3. Our delivery partner will collect the item\n4. Refund will be processed within 5-7 business days", is_active: true },
          { id: "2", policy_type: "cancellation", title: "Cancellation Policy", content: "## Cancellation Policy\n\n### Before Dispatch\n- Orders can be cancelled anytime before dispatch\n- Full refund will be credited to your wallet\n\n### After Dispatch\n- Once dispatched, orders cannot be cancelled\n- You may request a return after delivery", is_active: true },
          { id: "3", policy_type: "refund", title: "Refund Policy", content: "## Refund Policy\n\n### Refund Methods\n- **Wallet Credit**: Instant refund to your Ela Bazar wallet\n- **Original Payment Method**: 5-7 business days\n\n### Conditions\n- Item must pass quality check\n- All tags and packaging must be intact", is_active: true },
          FALLBACK_PRIVACY_POLICY,
        ] as Policy[];
      }
      const rows = data as Policy[];
      return rows.some((p) => p.policy_type === "privacy")
        ? rows
        : [...rows, FALLBACK_PRIVACY_POLICY];
    },
  });

  const [activeTab, setActiveTab] = useState<string | undefined>(slug);

  // Tabs' `value` must be controlled — otherwise navigating between footer
  // policy links reuses this same mounted component (same route pattern,
  // different :slug) and the displayed tab never changes after the first load.
  useEffect(() => {
    if (slug) {
      setActiveTab(slug);
    } else if (!activeTab && policies.length > 0) {
      setActiveTab(policies[0].policy_type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, policies]);

  const effectiveTab = activeTab || policies[0]?.policy_type || "return";

  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return (
          <h2 key={i} className="text-xl font-semibold mt-6 mb-3">
            {line.replace("## ", "")}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3 key={i} className="text-lg font-medium mt-4 mb-2">
            {line.replace("### ", "")}
          </h3>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <li key={i} className="ml-4 list-disc">
            {line.replace("- ", "")}
          </li>
        );
      }
      if (line.match(/^\d+\. /)) {
        return (
          <li key={i} className="ml-4 list-decimal">
            {line.replace(/^\d+\. /, "")}
          </li>
        );
      }
      if (line.startsWith("**") && line.endsWith("**")) {
        return (
          <p key={i} className="font-semibold mt-2">
            {line.replace(/\*\*/g, "")}
          </p>
        );
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return (
        <p key={i} className="text-muted-foreground">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Policies</h1>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : policies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No policies available at this time.
              </CardContent>
            </Card>
          ) : (
            <Tabs
              value={effectiveTab}
              onValueChange={(v) => {
                setActiveTab(v);
                navigate(`/policies/${v}`, { replace: true });
              }}
              className="w-full"
            >
              <TabsList className="w-full flex-wrap h-auto gap-2 bg-transparent justify-start">
                {policies.map((policy) => (
                  <TabsTrigger
                    key={policy.id}
                    value={policy.policy_type}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {policy.title}
                  </TabsTrigger>
                ))}
              </TabsList>

              {policies.map((policy) => (
                <TabsContent key={policy.id} value={policy.policy_type}>
                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle>{policy.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                      {renderContent(policy.content)}
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
