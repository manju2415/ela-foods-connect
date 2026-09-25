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
  content: "## Privacy Policy\n\nThis Privacy Policy explains how ELA FOODS AND SNACKS PRIVATE LIMITED (\"Ela Bazar\", \"we\", \"us\") collects, uses, shares and protects your personal information when you use the Ela Bazar website and mobile apps. By using our services, you agree to the practices described here.\n\n### Information We Collect\n- Account information: your name, mobile number, email address (if provided) and referral details when you register\n- Delivery information: delivery addresses, pincode and location details you provide so we can deliver your orders\n- Order history: products purchased, order amounts, payment status, returns, cancellations and refunds\n- Wallet and referral information: wallet balance, referral earnings, and the bank account or UPI details you provide for withdrawals\n- Device data: device type, operating system, app version, IP address, browser type and basic usage logs used to keep the service secure and working\n\n### How We Use Your Information\n- To process, deliver and track your orders, returns and refunds\n- To verify your identity through OTP (one-time password) authentication on your mobile number\n- To manage your wallet, referral rewards and withdrawal requests\n- To provide customer support and respond to your requests\n- To send order updates and, where you have opted in, offers and newsletters\n- To prevent fraud, misuse and unauthorised access, and to comply with legal obligations\n\n### Payment Gateway\n- Online payments are processed by Razorpay, our third-party payment gateway\n- Your card, UPI, net banking and wallet credentials are entered on and handled securely by Razorpay\n- We do not collect or store your full card number, CVV, UPI PIN or banking passwords\n- We only receive payment confirmation details such as the transaction ID, amount and payment status\n\n### Data Sharing\n- We share delivery details (name, phone number and address) only with our logistics and delivery partners to fulfil your orders\n- We share information with payment partners only as needed to complete your transactions\n- We may disclose information to government or law enforcement authorities when required by law or a valid legal process\n- We do not sell, rent or trade your personal information to anyone\n\n### Data Security\n- Data is transmitted over encrypted (HTTPS) connections\n- Access to personal data is restricted to authorised personnel who need it to operate our services\n- We use secure, access-controlled cloud infrastructure to store your data\n- While we take reasonable measures to protect your data, no method of transmission or storage over the internet is completely secure\n\n### Data Retention\n- We keep your information for as long as your account is active or as needed to provide our services\n- Order, invoice and payment records may be retained for the period required under applicable tax and accounting laws\n\n### Your Rights and Account Deletion\n- You can view and update your profile and delivery addresses from your account\n- You can unsubscribe from promotional messages at any time\n- You can request deletion of your account and associated personal data from the Account Deletion page at /account-deletion\n- Some records may be retained after deletion where required by law (for example, invoices and tax records)\n\n### Children's Privacy\n- Our services are intended for users aged 18 years and above. We do not knowingly collect personal data from children\n\n### Changes to This Policy\n- We may update this Privacy Policy from time to time. The updated version will be posted on this page and applies from the date it is published\n\n### Grievance Officer\nIn accordance with the Information Technology Act, 2000 and the rules made under it, and the Digital Personal Data Protection Act, 2023, you may contact our Grievance Officer with any questions or complaints about your personal data:\n\n- Grievance Officer, ELA FOODS AND SNACKS PRIVATE LIMITED\n- Address: No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore, Karnataka 560090\n- Phone: +918747003999\n- Email: elasnacks@gmail.com\n- We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days of receipt",
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
