import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wallet, ArrowUpRight, ArrowDownLeft, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { initiateRazorpayPayment, isPaymentCancelled, preloadRazorpayScript } from "@/utils/razorpay";
import { realEmailOrEmpty } from "@/lib/email";
import { toast } from "sonner";
import { InviteCodeCard } from "@/components/InviteCodeCard";

interface WalletData {
  balance: number;
  purchase_only_balance: number | null;
  withdrawable_balance: number | null;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

export default function CustomerWalletPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [walletLimits, setWalletLimits] = useState({ min_wallet_topup: 100, max_wallet_balance: 0 });

  const fetchData = useCallback(async () => {
    if (!user) return;

    const walletRes = await supabase
      .from("wallets")
      .select("id, balance, purchase_only_balance, withdrawable_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (walletRes.data) {
      setWallet(walletRes.data);
      const transactionsRes = await supabase
        .from("wallet_transactions")
        .select("id, amount, type, description, created_at")
        .eq("wallet_id", walletRes.data.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setTransactions(transactionsRes.data || []);
    } else {
      setWallet(null);
      setTransactions([]);
    }
    
    setLoading(false);
  }, [user]);

  // Start fetching Razorpay's script now so it is ready when Pay is tapped.
  useEffect(() => {
    preloadRazorpayScript();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    supabase
      .from("mlm_settings")
      .select("value")
      .eq("key", "wallet_settings")
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.value as { min_wallet_topup?: number; max_wallet_balance?: number } | null;
        if (value) {
          setWalletLimits({
            min_wallet_topup: Number(value.min_wallet_topup) || 100,
            max_wallet_balance: Number(value.max_wallet_balance) || 0,
          });
        }
      });
  }, []);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchData,
  });

  const openTopup = () => {
    setTopupAmount("");
    setTopupOpen(true);
  };

  const handleConfirmTopup = async () => {
    if (!user) return;
    const value = Number(topupAmount);

    if (!value || value <= 0) {
      toast.error("Enter an amount to add");
      return;
    }
    if (value < walletLimits.min_wallet_topup) {
      toast.error(`Minimum amount is ₹${walletLimits.min_wallet_topup}`);
      return;
    }
    const currentBalance = wallet?.balance || 0;
    if (walletLimits.max_wallet_balance > 0 && currentBalance + value > walletLimits.max_wallet_balance) {
      toast.error(`Wallet balance can't exceed ₹${walletLimits.max_wallet_balance}`);
      return;
    }

    setTopupSubmitting(true);
    try {
      await initiateRazorpayPayment({
        amount: value,
        receipt: `wallet_${Date.now()}`,
        purpose: "wallet_topup",
        notes: { description: "Add money to wallet" },
        attemptContext: { purpose: "wallet_topup", user_id: user.id },
        prefill: {
          name: (user.user_metadata?.full_name as string) || "",
          contact: user.phone || "",
          email: realEmailOrEmpty(user.email),
        },
        onSuccess: async () => {
          toast.success("Money added to wallet!");
          setTopupSubmitting(false);
          setTopupOpen(false);
          await fetchData();
        },
        onFailure: (err) => {
          setTopupSubmitting(false);
          if (isPaymentCancelled(err)) {
            toast.info("Payment cancelled");
          } else {
            toast.error(err?.message || "Payment failed");
          }
        },
      });
    } catch (err) {
      setTopupSubmitting(false);
      toast.error(err instanceof Error ? err.message : "Payment failed");
    }
  };

  const formatTransactionType = (type: string) => {
    return type.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  if (!user) {
    return (
      <MobileAppLayout appType="customer">
      <div className="min-h-screen bg-background">
        <MobileHeader title="Wallet" showBack showLogin />
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
          <Wallet className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">Sign in to view wallet</h2>
          <button
            onClick={() => navigate("/auth?redirect=/customer-app/wallet")}
            className="text-primary underline"
          >
            Sign in
          </button>
        </div>
      </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="customer">
    <div className="min-h-screen bg-background">
      <MobileHeader title="Wallet" showBack />
      
      <PullToRefresh
        isPulling={isPulling}
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
        shouldTrigger={shouldTrigger}
        handlers={handlers}
      >
        <div className="p-4 space-y-4">
          {/* Balance Card */}
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <CardContent className="p-6">
              <p className="text-sm opacity-90 mb-1">Total Balance</p>
              <p className="text-3xl font-bold mb-4">
                ₹{wallet?.balance?.toFixed(2) || "0.00"}
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-primary-foreground/20">
                <div>
                  <p className="text-xs opacity-75">Purchase Only</p>
                  <p className="text-lg font-semibold">
                    ₹{wallet?.purchase_only_balance?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-75">Withdrawable</p>
                  <p className="text-lg font-semibold">
                    ₹{wallet?.withdrawable_balance?.toFixed(2) || "0.00"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={openTopup}>
              <Plus className="h-5 w-5" />
              <span className="text-sm">Add Money</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowUpRight className="h-5 w-5" />
              <span className="text-sm">Withdraw</span>
            </Button>
          </div>

          {user && <InviteCodeCard userId={user.id} />}

          {/* Transactions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted" />
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-2/3 mb-1" />
                        <div className="h-3 bg-muted rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {transactions.map((txn) => (
                    <div key={txn.id} className="flex items-center gap-3 p-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        txn.amount > 0 
                          ? "bg-green-100 text-green-600 dark:bg-green-900/30" 
                          : "bg-red-100 text-red-600 dark:bg-red-900/30"
                      }`}>
                        {txn.amount > 0 
                          ? <ArrowDownLeft className="h-5 w-5" />
                          : <ArrowUpRight className="h-5 w-5" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {formatTransactionType(txn.type)}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {txn.description || format(new Date(txn.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <p className={`font-semibold ${
                        txn.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {txn.amount > 0 ? "+" : ""}₹{Math.abs(txn.amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PullToRefresh>
    </div>

    <Dialog open={topupOpen} onOpenChange={(open) => !topupSubmitting && setTopupOpen(open)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Money to Wallet</DialogTitle>
          <DialogDescription>
            Minimum ₹{walletLimits.min_wallet_topup}
            {walletLimits.max_wallet_balance > 0 && ` · Max balance ₹${walletLimits.max_wallet_balance}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="topup-amount">Amount (₹)</Label>
          <Input
            id="topup-amount"
            type="number"
            inputMode="numeric"
            min={walletLimits.min_wallet_topup}
            placeholder={`Enter amount (min ₹${walletLimits.min_wallet_topup})`}
            value={topupAmount}
            onChange={(e) => setTopupAmount(e.target.value)}
            disabled={topupSubmitting}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTopupOpen(false)} disabled={topupSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirmTopup} disabled={topupSubmitting}>
            {topupSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Proceed to Pay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </MobileAppLayout>
  );
}
