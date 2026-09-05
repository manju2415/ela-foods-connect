import { useEffect, useCallback } from "react";
import { useOfflineStorage } from "./useOfflineStorage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

interface AssignmentStatusUpdateData {
  assignmentId: string;
  status: string;
  updates: Record<string, unknown>;
  orderId: string;
  orderStatus: Database["public"]["Enums"]["order_status"];
}

interface AvailabilityUpdateData {
  partnerId: string;
  isAvailable: boolean;
}

export function useOfflineSync() {
  const { 
    isOnline, 
    pendingSync, 
    getPendingItems, 
    markSynced, 
    clearSyncedItems 
  } = useOfflineStorage();

  const syncPendingUpdates = useCallback(async () => {
    if (!isOnline) return;

    const pendingItems = await getPendingItems();
    if (pendingItems.length === 0) return;

    let successCount = 0;
    let errorCount = 0;

    for (const item of pendingItems) {
      try {
        switch (item.type) {
          case "assignment_status_update": {
            const { assignmentId, updates, orderId, orderStatus } = item.data as AssignmentStatusUpdateData;

            // Update assignment status
            const { error: assignmentError } = await supabase
              .from("order_assignments")
              .update(updates)
              .eq("id", assignmentId);

            if (assignmentError) throw assignmentError;

            // Update order status
            const { error: orderError } = await supabase
              .from("orders")
              .update({ status: orderStatus })
              .eq("id", orderId);

            if (orderError) throw orderError;

            await markSynced(item.id);
            successCount++;
            break;
          }

          case "availability_update": {
            const { partnerId, isAvailable } = item.data as AvailabilityUpdateData;

            const { error: availError } = await supabase
              .from("delivery_partners")
              .update({ is_available: isAvailable })
              .eq("id", partnerId);

            if (availError) throw availError;

            await markSynced(item.id);
            successCount++;
            break;
          }

          default:
            console.warn(`Unknown sync type: ${item.type}`);
        }
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        errorCount++;
      }
    }

    // Clear synced items
    await clearSyncedItems();

    if (successCount > 0) {
      toast.success(`Synced ${successCount} offline update${successCount > 1 ? 's' : ''}`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to sync ${errorCount} update${errorCount > 1 ? 's' : ''}`);
    }
  }, [isOnline, getPendingItems, markSynced, clearSyncedItems]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingSync > 0) {
      syncPendingUpdates();
    }
  }, [isOnline, pendingSync, syncPendingUpdates]);

  return {
    isOnline,
    pendingSync,
    syncPendingUpdates,
  };
}
