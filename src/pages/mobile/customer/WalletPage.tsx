import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, ArrowUpRight, ArrowDownLeft, Plus } from "lucide-react";
import { format } from "date-fns";

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

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    const [walletRes, transactionsRes] = await Promise.all([
      supabase
        .from("wallets")
        .select("balance, purchase_only_balance, withdrawable_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select("id, amount, type, description, created_at, wallet_id")
        .order("created_at", { ascending: false })
        .limit(20)
    ]);
    
    if (walletRes.data) {
      setWallet(walletRes.data);
    }

    // Filter transactions for user's wallet
    if (transactionsRes.data && walletRes.data) {
      const userWalletId = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", user.id)
        .single();
      
      if (userWalletId.data) {
        const filtered = transactionsRes.data.filter(
          (t: any) => t.wallet_id === userWalletId.data.id
        );
        setTransactions(filtered);
      }
    }
    
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchData,
  });

  const formatTransactionType = (type: string) => {
    return type.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  if (!user) {
    return (
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
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="Wallet" />
      
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
            <Button variant="outline" className="h-auto py-4 flex-col gap-2">
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
  );
}
