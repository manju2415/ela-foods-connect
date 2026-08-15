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

  useEffect(() => {
    if (!open || !userId) return;
    setAmount("");
    setReason("");
    setDirection("credit");
    setBucket("withdrawable");
    supabase
      .from("wallets")
      .select("balance, withdrawable_balance, purchase_only_balance")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setBalances(
          data
            ? {
                balance: Number(data.balance ?? 0),
                withdrawable_balance: Number(data.withdrawable_balance ?? 0),
                purchase_only_balance: Number(data.purchase_only_balance ?? 0),
              }
            : { balance: 0, withdrawable_balance: 0, purchase_only_balance: 0 },
        );
      });
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
    onOpenChange(false);
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
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
