import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, Gift, Users, Wallet, RefreshCw } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

interface ReferralCode {
  code: string;
  usage_count: number;
  max_uses: number | null;
  is_active: boolean;
}

interface ReferralStats {
  total_referrals: number;
  total_earnings: number;
  referral_count: number;
  user_level: string;
}

interface ReferralSectionProps {
  userId: string;
}

export const ReferralSection = ({ userId }: ReferralSectionProps) => {
  const [referralCodes, setReferralCodes] = useState<ReferralCode[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    setLoading(true);
    
    const [codesRes, profileRes, referralsRes, walletRes] = await Promise.all([
      supabase.from("referral_codes").select("*").eq("user_id", userId).eq("is_active", true),
      supabase.from("profiles").select("referral_count, user_level").eq("id", userId).maybeSingle(),
      supabase.from("referrals").select("id").eq("referrer_id", userId),
      supabase.from("wallets").select("id").eq("user_id", userId).maybeSingle(),
    ]);

    if (codesRes.data) {
      setReferralCodes(codesRes.data);
    }

    // Calculate earnings from wallet_transactions (referral_bonus type)
    let totalEarnings = 0;
    if (walletRes.data?.id) {
      const { data: txns } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("wallet_id", walletRes.data.id)
        .eq("type", "referral_bonus");
      totalEarnings = (txns || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    }

    setStats({
      total_referrals: referralsRes.data?.length || 0,
      total_earnings: totalEarnings,
      referral_count: profileRes.data?.referral_count || 0,
      user_level: profileRes.data?.user_level || "associate",
    });

    setLoading(false);
  };

  const generateCode = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc("generate_user_referral_code", {
      p_user_id: userId,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to generate referral code",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Your referral code is: ${data}`,
      });
      fetchData();
    }
    setGenerating(false);
  };

  const copyCode = async (code: string) => {
    const success = await copyToClipboard(code);
    toast(success ? {
      title: "Copied!",
      description: "Referral code copied to clipboard",
    } : {
      title: "Copy failed",
      description: "Please copy the code manually.",
      variant: "destructive",
    });
  };

  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case "founder":
        return "bg-primary text-primary-foreground";
      case "master":
        return "bg-blue-600 text-white";
      case "associate":
        return "bg-green-600 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Your Level</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getLevelBadgeColor(stats?.user_level || "associate")}>
              {(stats?.user_level || "associate").replace(/\b\w/g, (l) => l.toUpperCase())}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_referrals || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{(stats?.total_earnings || 0).toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Network Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.referral_count || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Codes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Your Referral Code
          </CardTitle>
          <CardDescription>
            Share this code with friends and family to earn bonuses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referralCodes.length === 0 ? (
            <div className="text-center py-6">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                You don't have a referral code yet
              </p>
              <Button onClick={generateCode} disabled={generating}>
                {generating && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                Generate My Code
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {referralCodes.map((code) => (
                <div
                  key={code.code}
                  className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20"
                >
                  <div>
                    <span className="font-mono font-bold text-2xl text-primary">{code.code}</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      {code.usage_count} referrals {code.max_uses && `(max ${code.max_uses})`}
                    </p>
                  </div>
                  <Button onClick={() => copyCode(code.code)} variant="outline">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">How it works:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Share your code with friends and family</li>
              <li>• They use your code during registration</li>
              <li>• You earn bonus credits in your wallet</li>
              <li>• First 10 referrals: Withdrawable bonus</li>
              <li>• Beyond 10: Purchase credits bonus</li>
              <li>• Earn commission on their purchases!</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};