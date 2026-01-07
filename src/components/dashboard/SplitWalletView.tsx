import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Wallet, ArrowUpRight, ArrowDownRight, Banknote, ShoppingBag, History } from "lucide-react";

interface WalletData {
  id: string;
  balance: number;
  withdrawable_balance: number;
  purchase_only_balance: number;
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  is_withdrawable: boolean;
  created_at: string;
  balance_after: number;
}

interface SplitWalletViewProps {
  userId: string;
}

export const SplitWalletView = ({ userId }: SplitWalletViewProps) => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchWalletData();
  }, [userId]);

  const fetchWalletData = async () => {
    setLoading(true);
    
    const [walletRes, transactionsRes] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", (await supabase.from("wallets").select("id").eq("user_id", userId).maybeSingle()).data?.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (walletRes.data) {
      setWallet(walletRes.data as WalletData);
    }
    
    if (transactionsRes.data) {
      setTransactions(transactionsRes.data as WalletTransaction[]);
    }
    
    setLoading(false);
  };

  const handleWithdrawRequest = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (amount > (wallet?.withdrawable_balance || 0)) {
      toast({
        title: "Insufficient balance",
        description: "You can only withdraw up to ₹" + (wallet?.withdrawable_balance || 0).toFixed(2),
        variant: "destructive",
      });
      return;
    }

    // In production, this would create a withdrawal request
    toast({
      title: "Withdrawal requested",
      description: `₹${amount.toFixed(2)} withdrawal request has been submitted. It will be processed within 3-5 business days.`,
    });
    setWithdrawOpen(false);
    setWithdrawAmount("");
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "referral_bonus":
        return <ArrowDownRight className="h-4 w-4 text-green-600" />;
      case "credit":
        return <ArrowDownRight className="h-4 w-4 text-green-600" />;
      case "debit":
      case "purchase":
        return <ArrowUpRight className="h-4 w-4 text-red-600" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-24" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-24" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              ₹{(wallet?.balance || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Withdrawable
            </CardTitle>
            <CardDescription className="text-xs">Can be withdrawn to bank</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{(wallet?.withdrawable_balance || 0).toFixed(2)}
            </div>
            {(wallet?.withdrawable_balance || 0) > 0 && (
              <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="mt-2">
                    Withdraw
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Withdraw to Bank</DialogTitle>
                    <DialogDescription>
                      Enter the amount you want to withdraw. Maximum: ₹{(wallet?.withdrawable_balance || 0).toFixed(2)}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Amount (₹)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        max={wallet?.withdrawable_balance || 0}
                      />
                    </div>
                    <Button onClick={handleWithdrawRequest} className="w-full">
                      Request Withdrawal
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Purchase Only
            </CardTitle>
            <CardDescription className="text-xs">Use for shopping only</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{(wallet?.purchase_only_balance || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>Your recent wallet transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {tx.description || tx.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${["credit", "referral_bonus", "refund"].includes(tx.type) ? "text-green-600" : "text-red-600"}`}>
                      {["credit", "referral_bonus", "refund"].includes(tx.type) ? "+" : "-"}₹{Number(tx.amount).toFixed(2)}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {tx.is_withdrawable ? "Withdrawable" : "Purchase only"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};