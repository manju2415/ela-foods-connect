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
        ] as Policy[];
      }
      return data as Policy[];
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
