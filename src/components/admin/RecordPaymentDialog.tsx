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
import { Loader2, IndianRupee } from "lucide-react";
import { toast } from "sonner";

interface RecordPaymentDialogProps {
  userId: string | null;
  userName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onSuccess,
}: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("4999");
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("razorpay");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setAmount("4999");
    setReference("");
    setMethod("razorpay");
    setNotes("");
    supabase
      .from("profiles")
      .select("registration_fee_paid")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setAlreadyPaid(Number(data?.registration_fee_paid ?? 0)));
  }, [open, userId]);

  const handleSubmit = async () => {
    if (!userId) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("admin_record_registration_payment", {
      p_user_id: userId,
      p_amount: value,
      p_reference: reference.trim() || null,
      p_method: method,
      p_notes: notes.trim() || null,
    });
    setSubmitting(false);

    const result = data as { success?: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast.error(result?.error || error?.message || "Failed to record payment");
      return;
    }

    toast.success("Registration payment recorded and membership activated");
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4" /> Record Registration Payment
          </DialogTitle>
          <DialogDescription>
            {userName
              ? `Manually record a paid registration fee for ${userName}.`
              : "Manually record a paid registration fee."}{" "}
            This activates the member and releases referral bonuses.
          </DialogDescription>
        </DialogHeader>

        {alreadyPaid !== null && alreadyPaid > 0 && (
          <p className="rounded-md bg-muted p-3 text-sm">
            Already recorded: <strong>₹{alreadyPaid.toFixed(2)}</strong>
          </p>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount (₹)</Label>
              <Input
                id="pay-amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="razorpay">Razorpay</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="manual">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-ref">Payment reference / ID</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. pay_XXXXXXXXXXXX or UTR"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-notes">Notes (optional)</Label>
            <Textarea
              id="pay-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Payment captured on Razorpay but callback failed"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
