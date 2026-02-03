import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Package, Warehouse } from "lucide-react";

interface ReturnConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  onConfirm: () => Promise<void>;
  isProcessing: boolean;
}

export function ReturnConfirmDialog({
  open,
  onOpenChange,
  orderNumber,
  onConfirm,
  isProcessing,
}: ReturnConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            Confirm Return Delivery
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              You are about to mark order <strong>{orderNumber}</strong> as returned to the warehouse.
            </p>
            <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
              <Package className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-sm">
                Please ensure the parcel has been physically handed over to the warehouse before confirming.
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isProcessing}
          >
            {isProcessing ? "Processing..." : "Confirm Return"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
