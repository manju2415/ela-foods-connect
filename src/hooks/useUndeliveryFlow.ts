import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { UndeliveryReason } from "@/components/delivery/UndeliveryDialog";

interface Assignment {
  id: string;
  order_id: string;
  status: string;
  order: {
    order_number: string;
    status?: string;
  };
}

export function useUndeliveryFlow(
  partnerId: string | null,
  onSuccess?: () => void
) {
  const markAsUndelivered = useCallback(
    async (
      assignment: Assignment,
      reason: UndeliveryReason,
      notes: string
    ) => {
      if (!partnerId) {
        toast.error("Delivery partner not found");
        return false;
      }

      try {
        // Get the current attempt count for this order
        const { data: existingLogs } = await supabase
          .from("undelivery_logs")
          .select("attempt_number")
          .eq("order_id", assignment.order_id)
          .order("attempt_number", { ascending: false })
          .limit(1);

        const attemptNumber = existingLogs && existingLogs.length > 0 
          ? existingLogs[0].attempt_number + 1 
          : 1;

        // Get current order status for history
        const { data: currentOrder } = await supabase
          .from("orders")
          .select("status")
          .eq("id", assignment.order_id)
          .single();

        // Create undelivery log
        const { error: logError } = await supabase
          .from("undelivery_logs")
          .insert({
            order_id: assignment.order_id,
            order_assignment_id: assignment.id,
            delivery_partner_id: partnerId,
            reason: reason,
            reason_notes: notes || null,
            attempt_number: attemptNumber,
            undelivered_at: new Date().toISOString(),
            return_initiated_at: new Date().toISOString(),
          });

        if (logError) throw logError;

        // Update order status to undelivered, then return_initiated
        const { error: orderError } = await supabase
          .from("orders")
          .update({ 
            status: "return_initiated",
            updated_at: new Date().toISOString()
          })
          .eq("id", assignment.order_id);

        if (orderError) throw orderError;

        // Update assignment status
        const { error: assignmentError } = await supabase
          .from("order_assignments")
          .update({ 
            status: "undelivered",
            undelivery_reason: reason,
            updated_at: new Date().toISOString()
          })
          .eq("id", assignment.id);

        if (assignmentError) throw assignmentError;

        // Log status history (cast to any for type compatibility until types regenerate)
        await supabase.from("order_status_history").insert({
          order_id: assignment.order_id,
          previous_status: (currentOrder?.status || "out_for_delivery") as any,
          new_status: "undelivered" as any,
          changed_by_type: "delivery_partner",
          delivery_partner_id: partnerId,
          notes: `Reason: ${reason}${notes ? ` - ${notes}` : ""}`,
          metadata: { reason, notes, attempt_number: attemptNumber },
        } as any);

        // Log return initiated
        await supabase.from("order_status_history").insert({
          order_id: assignment.order_id,
          previous_status: "undelivered" as any,
          new_status: "return_initiated" as any,
          changed_by_type: "system",
          delivery_partner_id: partnerId,
          notes: "Return process automatically initiated",
          metadata: { triggered_by: "undelivery_flow" },
        } as any);

        // Create notification for customer
        const { data: order } = await supabase
          .from("orders")
          .select("user_id, order_number")
          .eq("id", assignment.order_id)
          .single();

        if (order) {
          await supabase.from("notifications").insert({
            user_id: order.user_id,
            title: "Delivery Unsuccessful",
            message: `Your order #${order.order_number} could not be delivered. Reason: ${reason.replace(/_/g, " ")}. The parcel is being returned.`,
            type: "order",
            reference_type: "order",
            reference_id: assignment.order_id,
          });
        }

        toast.success("Order marked as undelivered. Return process initiated.");
        onSuccess?.();
        return true;
      } catch (error: any) {
        console.error("Failed to mark as undelivered:", error);
        toast.error(error.message || "Failed to process undelivery");
        return false;
      }
    },
    [partnerId, onSuccess]
  );

  const markReturnCompleted = useCallback(
    async (assignment: Assignment) => {
      if (!partnerId) {
        toast.error("Delivery partner not found");
        return false;
      }

      try {
        // Update order status to returned
        const { error: orderError } = await supabase
          .from("orders")
          .update({ 
            status: "returned",
            updated_at: new Date().toISOString()
          })
          .eq("id", assignment.order_id);

        if (orderError) throw orderError;

        // Update assignment status
        const { error: assignmentError } = await supabase
          .from("order_assignments")
          .update({ 
            status: "returned",
            delivered_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", assignment.id);

        if (assignmentError) throw assignmentError;

        // Update undelivery log
        await supabase
          .from("undelivery_logs")
          .update({
            return_completed_at: new Date().toISOString(),
            return_received_by: "Warehouse",
          })
          .eq("order_assignment_id", assignment.id);

        // Log status history
        await supabase.from("order_status_history").insert({
          order_id: assignment.order_id,
          previous_status: "return_initiated" as any,
          new_status: "returned" as any,
          changed_by_type: "delivery_partner",
          delivery_partner_id: partnerId,
          notes: "Parcel returned to warehouse",
        } as any);

        // Notify customer
        const { data: order } = await supabase
          .from("orders")
          .select("user_id, order_number")
          .eq("id", assignment.order_id)
          .single();

        if (order) {
          await supabase.from("notifications").insert({
            user_id: order.user_id,
            title: "Order Returned",
            message: `Your order #${order.order_number} has been returned to our warehouse. If you'd like to reschedule delivery, please contact support.`,
            type: "order",
            reference_type: "order",
            reference_id: assignment.order_id,
          });
        }

        toast.success("Return completed successfully!");
        onSuccess?.();
        return true;
      } catch (error: any) {
        console.error("Failed to complete return:", error);
        toast.error(error.message || "Failed to complete return");
        return false;
      }
    },
    [partnerId, onSuccess]
  );

  return {
    markAsUndelivered,
    markReturnCompleted,
  };
}
