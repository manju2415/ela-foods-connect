import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

interface WalletAdjustDialogProps {
  userId: string | null;
  userName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function WalletAdjustDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onSuccess,
}: WalletAdjustDialogProps) {
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState<"withdrawable" | "purchase_only">("withdrawable");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [balances, setBalances] = useState<{
    balance: number;
    withdrawable_balance: number;
    purchase_only_balance: number;
  } | null>(null);
  const [transactions, setTransactions] = useState<
    Array<{
      id: string;
      type: string;
      amount: number;
      balance_after: number;
      description: string | null;
      created_at: string;
      is_withdrawable: boolean | null;
    }>
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadWallet = async (uid: string) => {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, balance, withdrawable_balance, purchase_only_balance")
      .eq("user_id", uid)
      .maybeSingle();

    setBalances(
      wallet
        ? {
            balance: Number(wallet.balance ?? 0),
            withdrawable_balance: Number(wallet.withdrawable_balance ?? 0),
            purchase_only_balance: Number(wallet.purchase_only_balance ?? 0),
          }
        : { balance: 0, withdrawable_balance: 0, purchase_only_balance: 0 },
    );

    if (!wallet?.id) {
      setTransactions([]);
      return;
    }
    setLoadingHistory(true);
    const { data: txns } = await supabase
      .from("wallet_transactions")
      .select("id, type, amount, balance_after, description, created_at, is_withdrawable")
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .limit(25);
    setTransactions(txns || []);
    setLoadingHistory(false);
  };

  useEffect(() => {
    if (!open || !userId) return;
    setAmount("");
    setReason("");
    setDirection("credit");
    setBucket("withdrawable");
    setTransactions([]);
    void loadWallet(userId);
  }, [open, userId]);

  const handleSubmit = async () => {
    if (!userId) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("admin_adjust_wallet", {
      p_user_id: userId,
      p_amount: value,
      p_bucket: bucket,
      p_direction: direction,
      p_reason: reason.trim(),
    });
    setSubmitting(false);

    const result = data as { success?: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast.error(result?.error || error?.message || "Failed to adjust wallet");
      return;
    }

    toast.success(
      `₹${value.toFixed(2)} ${direction === "credit" ? "credited to" : "debited from"} the wallet`,
    );
    await loadWallet(userId);
    setAmount("");
    setReason("");
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Adjust Wallet
          </DialogTitle>
          <DialogDescription>
            {userName ? `Manual wallet adjustment for ${userName}` : "Manual wallet adjustment"}
          </DialogDescription>
        </DialogHeader>

        {balances && (
          <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="font-semibold">₹{balances.balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Withdrawable</p>
              <p className="font-semibold">₹{balances.withdrawable_balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Purchase only</p>
              <p className="font-semibold">₹{balances.purchase_only_balance.toFixed(2)}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (add)</SelectItem>
                  <SelectItem value="debit">Debit (deduct)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Balance type</Label>
              <Select value={bucket} onValueChange={(v) => setBucket(v as typeof bucket)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="withdrawable">Withdrawable</SelectItem>
                  <SelectItem value="purchase_only">Purchase only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallet-amount">Amount (₹)</Label>
            <Input
              id="wallet-amount"
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallet-reason">Reason (required)</Label>
            <Textarea
              id="wallet-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Missed referral bonus, offline payout correction"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Recent transactions</Label>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
            {loadingHistory ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No transactions yet</p>
            ) : (
              transactions.map((txn) => {
                const isDebit = txn.type === "debit" || txn.type === "purchase";
                return (
                  <div key={txn.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{txn.description || txn.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(txn.created_at).toLocaleString("en-IN")} ·{" "}
                        {txn.is_withdrawable ? "Withdrawable" : "Purchase only"}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-semibold ${isDebit ? "text-destructive" : "text-green-600"}`}>
                      {isDebit ? "-" : "+"}₹{Number(txn.amount).toFixed(2)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {direction === "credit" ? "Credit wallet" : "Debit wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
