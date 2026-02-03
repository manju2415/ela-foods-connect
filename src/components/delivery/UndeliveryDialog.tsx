import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Package, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type UndeliveryReason = 
  | 'customer_unavailable'
  | 'wrong_address'
  | 'customer_refused'
  | 'payment_issue'
  | 'incomplete_address'
  | 'area_inaccessible'
  | 'customer_rescheduled'
  | 'other';

interface UndeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  isCOD?: boolean;
  onConfirm: (reason: UndeliveryReason, notes: string) => Promise<void>;
}

const UNDELIVERY_REASONS: { value: UndeliveryReason; label: string; description: string }[] = [
  { 
    value: 'customer_unavailable', 
    label: 'Customer Unavailable',
    description: 'Customer not reachable or not at home'
  },
  { 
    value: 'wrong_address', 
    label: 'Wrong Address',
    description: 'Address is incorrect or does not exist'
  },
  { 
    value: 'customer_refused', 
    label: 'Customer Refused',
    description: 'Customer refused to accept the delivery'
  },
  { 
    value: 'payment_issue', 
    label: 'Payment Issue (COD)',
    description: 'Customer unable to pay COD amount'
  },
  { 
    value: 'incomplete_address', 
    label: 'Incomplete Address',
    description: 'Missing landmark, flat number, etc.'
  },
  { 
    value: 'area_inaccessible', 
    label: 'Area Inaccessible',
    description: 'Cannot reach due to road conditions, restrictions'
  },
  { 
    value: 'customer_rescheduled', 
    label: 'Customer Rescheduled',
    description: 'Customer requested delivery at later date'
  },
  { 
    value: 'other', 
    label: 'Other',
    description: 'Any other reason (specify in notes)'
  },
];

export function UndeliveryDialog({
  open,
  onOpenChange,
  orderNumber,
  isCOD = false,
  onConfirm,
}: UndeliveryDialogProps) {
  const [reason, setReason] = useState<UndeliveryReason | "">("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm(reason, notes);
      onOpenChange(false);
      // Reset form
      setReason("");
      setNotes("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Mark as Undelivered
          </DialogTitle>
          <DialogDescription>
            Order: {orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* COD Warning */}
          {isCOD && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <Package className="h-4 w-4" />
                This is a COD order. No payment will be collected.
              </p>
            </div>
          )}

          {/* Reason Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Select Reason <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as UndeliveryReason)}
              className="space-y-2"
            >
              {UNDELIVERY_REASONS.map((item) => (
                <label
                  key={item.value}
                  className={cn(
                    "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    reason === item.value 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value={item.value} className="mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Additional Notes {reason === 'other' && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide more details about why the delivery couldn't be completed..."
              rows={3}
            />
          </div>

          {/* Return Process Info */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <RotateCcw className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                After marking as undelivered, a return process will be initiated automatically. 
                You'll need to return the parcel to the warehouse.
              </span>
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason || (reason === 'other' && !notes.trim()) || isSubmitting}
          >
            {isSubmitting ? "Processing..." : "Mark Undelivered"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
