import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { OrderStatus } from "@/components/OrderStatusTimeline";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useUndeliveryFlow } from "@/hooks/useUndeliveryFlow";
import { UndeliveryDialog, type UndeliveryReason } from "@/components/delivery/UndeliveryDialog";
import { ReturnConfirmDialog } from "@/components/delivery/ReturnConfirmDialog";
import { PackagePhotoCapture } from "@/components/delivery/PackagePhotoCapture";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Clock, MapPin, Phone, Navigation, ChevronRight, AlertTriangle, RotateCcw, Warehouse } from "lucide-react";
import { format } from "date-fns";
import { maskPhoneNumber } from "@/utils/phoneMasking";
import { toast } from "sonner";

interface Assignment {
  id: string;
  order_id: string;
  status: string;
  assigned_at: string;
  undelivery_reason?: string;
  order: {
    order_number: string;
    total_amount: number;
    is_cod?: boolean;
    status?: string;
    shipping_address: {
      full_name?: string;
      phone?: string;
      address_line1?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };
  };
}

export default function DriverOrdersPage() {
  const { user } = useAuth();
  const _navigate = useNavigate();
  const { isOnline, cacheAssignments, getCachedAssignments, saveOffline } = useOfflineStorage();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Undelivery flow state
  const [undeliveryDialogOpen, setUndeliveryDialogOpen] = useState(false);
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [processingReturn, setProcessingReturn] = useState(false);

  // Photo capture state
  const [photoDialog, setPhotoDialog] = useState<null | { kind: "pickup" | "delivery"; assignment: Assignment; nextStatus: string }>(null);

  const fetchAssignments = useCallback(async () => {
    if (!user) return;

    // Check if delivery partner
    const { data: partner } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!partner) {
      toast.error("Not registered as delivery partner");
      return;
    }

    setPartnerId(partner.id);

    if (isOnline) {
      // Fetch active assignments (excluding completed deliveries and returns)
      const { data } = await supabase
        .from("order_assignments")
        .select("id, order_id, status, assigned_at, undelivery_reason")
        .eq("delivery_partner_id", partner.id)
        .not("status", "in", '("delivered","returned")')
        .order("assigned_at", { ascending: false });

      if (data) {
        const orderIds = data.map(a => a.order_id);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, total_amount, shipping_address, is_cod, status")
          .in("id", orderIds);

        const ordersMap = new Map(orders?.map(o => [o.id, o]) || []);
        
        const enriched = data.map(assignment => ({
          ...assignment,
          order: ordersMap.get(assignment.order_id) || {
            order_number: "N/A",
            total_amount: 0,
            shipping_address: {},
          },
        })) as Assignment[];

        setAssignments(enriched);
        await cacheAssignments(enriched);
      }
    } else {
      // Load from cache when offline
      const cached = await getCachedAssignments<Assignment>();
      setAssignments(cached);
    }

    setLoading(false);
  }, [user, isOnline, cacheAssignments, getCachedAssignments]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchAssignments,
  });

  const { markAsUndelivered, markReturnCompleted } = useUndeliveryFlow(partnerId, fetchAssignments);

  const updateStatus = async (assignment: Assignment, newStatus: string, photoUrl?: string) => {
    // Photo required for picked_up and delivered
    if (!photoUrl && (newStatus === "picked_up" || newStatus === "delivered")) {
      if (!isOnline) {
        toast.error("Photo capture requires internet connection");
        return;
      }
      setPhotoDialog({
        kind: newStatus === "picked_up" ? "pickup" : "delivery",
        assignment,
        nextStatus: newStatus,
      });
      return;
    }

    const updates: Partial<Tables<"order_assignments">> = { status: newStatus };
    if (newStatus === "picked_up") {
      updates.picked_up_at = new Date().toISOString();
      if (photoUrl) updates.pickup_photo_url = photoUrl;
    }
    if (newStatus === "delivered") {
      updates.delivered_at = new Date().toISOString();
      if (photoUrl) updates.delivery_photo_url = photoUrl;
    }

    const orderStatusMap: Record<string, "pending" | "confirmed" | "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled"> = {
      picked_up: "shipped",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
    };

    if (isOnline) {
      const { error } = await supabase
        .from("order_assignments")
        .update(updates)
        .eq("id", assignment.id);

      if (error) {
        toast.error("Failed to update status");
        return;
      }

      // Update order status
      if (orderStatusMap[newStatus]) {
        const { error: orderUpdateError } = await supabase
          .from("orders")
          .update({ status: orderStatusMap[newStatus] })
          .eq("id", assignment.order_id);

        if (orderUpdateError) {
          console.error("Failed to update order status:", orderUpdateError);
          toast.error("Failed to update order status");
          return;
        }

        // Log status history
        await supabase.from("order_status_history").insert({
          order_id: assignment.order_id,
          previous_status: (assignment.order.status || "processing") as OrderStatus,
          new_status: orderStatusMap[newStatus] as OrderStatus,
          changed_by_type: "delivery_partner",
          delivery_partner_id: partnerId,
          notes: `Status updated to ${newStatus}`,
        });
      }

      // Handle COD collection on delivery
      if (newStatus === "delivered" && assignment.order.is_cod) {
        const { error: codUpdateError } = await supabase
          .from("orders")
          .update({
            cod_collected: true,
            cod_collected_at: new Date().toISOString()
          })
          .eq("id", assignment.order_id);

        if (codUpdateError) {
          console.error("Failed to record COD collection:", codUpdateError);
          toast.error("Status updated, but COD collection could not be recorded");
        }
      }

      toast.success("Status updated");
      fetchAssignments();
    } else {
      // Save for offline sync
      await saveOffline("assignment_status_update", {
        assignmentId: assignment.id,
        status: newStatus,
        updates,
        orderId: assignment.order_id,
        orderStatus: orderStatusMap[newStatus],
      });

      // Update local state
      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, status: newStatus } : a
      ));
      
      toast.success("Status saved (will sync when online)");
    }
    
    setSelectedId(null);
  };

  const handleUndeliveryConfirm = async (reason: UndeliveryReason, notes: string) => {
    const selected = assignments.find(a => a.id === selectedId);
    if (!selected) return;
    
    await markAsUndelivered(selected, reason, notes);
    setUndeliveryDialogOpen(false);
    setSelectedId(null);
  };

  const handleReturnConfirm = async () => {
    const selected = assignments.find(a => a.id === selectedId);
    if (!selected) return;
    
    setProcessingReturn(true);
    await markReturnCompleted(selected);
    setProcessingReturn(false);
    setReturnConfirmOpen(false);
    setSelectedId(null);
  };

  const getStatusBadge = (status: string, orderStatus?: string) => {
    // Check if this is a return flow
    if (orderStatus === "return_initiated" || orderStatus === "return_in_transit") {
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Return Pending</Badge>;
    }
    
    switch (status) {
      case "assigned": return <Badge className="bg-blue-100 text-blue-800">Assigned</Badge>;
      case "picked_up": return <Badge className="bg-purple-100 text-purple-800">Picked Up</Badge>;
      case "out_for_delivery": return <Badge className="bg-cyan-100 text-cyan-800">Out for Delivery</Badge>;
      case "undelivered": return <Badge className="bg-orange-100 text-orange-800">Undelivered</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getNextAction = (status: string, orderStatus?: string) => {
    // If order is in return flow
    if (orderStatus === "return_initiated" || orderStatus === "return_in_transit") {
      return { label: "Return to Warehouse", next: "return", icon: Warehouse };
    }
    
    switch (status) {
      case "assigned": return { label: "Pick Up", next: "picked_up" };
      case "picked_up": return { label: "Out for Delivery", next: "out_for_delivery" };
      case "out_for_delivery": return { label: "Delivered", next: "delivered" };
      default: return null;
    }
  };

  const isReturnFlow = (assignment: Assignment) => {
    return assignment.order.status === "return_initiated" || 
           assignment.order.status === "return_in_transit" ||
           assignment.status === "undelivered";
  };

  const selected = assignments.find(a => a.id === selectedId);

  return (
    <MobileAppLayout appType="driver">
    <div className="min-h-screen bg-background">
      <MobileHeader 
        title="Active Orders"
        showBack
        rightAction={
          !isOnline && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              Offline
            </Badge>
          )
        }
      />
      
      <PullToRefresh
        isPulling={isPulling}
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
        shouldTrigger={shouldTrigger}
        handlers={handlers}
      >
        <div className="p-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-5 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium mb-2">No active orders</h2>
              <p className="text-muted-foreground text-center">
                New orders will appear here when assigned
              </p>
            </div>
          ) : (
            assignments.map((assignment) => (
              <Card 
                key={assignment.id}
                className={`cursor-pointer active:bg-muted/50 transition-colors ${isReturnFlow(assignment) ? 'border-amber-300 dark:border-amber-700' : ''}`}
                onClick={() => setSelectedId(assignment.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{assignment.order.order_number}</p>
                        {isReturnFlow(assignment) && (
                          <RotateCcw className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(assignment.status, assignment.order.status)}
                        {assignment.order.is_cod && (
                          <Badge variant="outline" className="text-xs">COD</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">₹{assignment.order.total_amount.toFixed(0)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {assignment.order.shipping_address?.address_line1}, {assignment.order.shipping_address?.city}
                    </p>
                    <p className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(assignment.assigned_at), "h:mm a")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </PullToRefresh>

      {/* Order Detail Sheet */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setSelectedId(null)}>
          <div 
            className="fixed bottom-0 left-0 right-0 bg-background border-t rounded-t-2xl p-4 pb-8 animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4" />
            
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{selected.order.order_number}</h3>
                  {isReturnFlow(selected) && (
                    <Badge className="bg-amber-100 text-amber-800">
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Return
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(selected.status, selected.order.status)}
                  {selected.order.is_cod && (
                    <Badge variant="outline" className="text-xs">COD ₹{selected.order.total_amount}</Badge>
                  )}
                </div>
              </div>
              <p className="text-xl font-bold">₹{selected.order.total_amount.toFixed(2)}</p>
            </div>

            {/* Return flow info */}
            {isReturnFlow(selected) && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    This order could not be delivered. Please return the parcel to the warehouse.
                    {selected.undelivery_reason && (
                      <span className="block mt-1 text-xs opacity-80">
                        Reason: {selected.undelivery_reason.replace(/_/g, " ")}
                      </span>
                    )}
                  </span>
                </p>
              </div>
            )}

            <div className="p-4 bg-muted rounded-lg mb-4 space-y-2">
              <p className="font-medium">{selected.order.shipping_address?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {selected.order.shipping_address?.address_line1}, {selected.order.shipping_address?.city}
              </p>
              {selected.order.shipping_address?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {maskPhoneNumber(selected.order.shipping_address.phone)}
                  </span>
                  <a
                    href={`tel:${selected.order.shipping_address.phone}`}
                    className="text-primary text-sm ml-2"
                  >
                    Call
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {/* Navigation button - always show for delivery, not for return */}
              {!isReturnFlow(selected) && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const addr = selected.order.shipping_address;
                    const query = encodeURIComponent(
                      `${addr?.address_line1}, ${addr?.city}, ${addr?.state} ${addr?.postal_code}`
                    );
                    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
                  }}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Navigate
                </Button>
              )}

              {/* Main action buttons */}
              <div className="flex gap-2">
                {/* Unable to deliver button - only for out_for_delivery status */}
                {selected.status === "out_for_delivery" && !isReturnFlow(selected) && (
                  <Button
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => setUndeliveryDialogOpen(true)}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Unable to Deliver
                  </Button>
                )}
                
                {/* Return to warehouse button */}
                {isReturnFlow(selected) && (
                  <Button
                    className="flex-1"
                    onClick={() => setReturnConfirmOpen(true)}
                  >
                    <Warehouse className="h-4 w-4 mr-2" />
                    Return to Warehouse
                  </Button>
                )}
                
                {/* Normal flow actions */}
                {getNextAction(selected.status, selected.order.status) && !isReturnFlow(selected) && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const action = getNextAction(selected.status, selected.order.status);
                      if (action && action.next !== "return") {
                        updateStatus(selected, action.next);
                      }
                    }}
                  >
                    {getNextAction(selected.status, selected.order.status)?.label}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Undelivery Dialog */}
      <UndeliveryDialog
        open={undeliveryDialogOpen}
        onOpenChange={setUndeliveryDialogOpen}
        orderNumber={selected?.order.order_number || ""}
        isCOD={selected?.order.is_cod}
        onConfirm={handleUndeliveryConfirm}
      />

      {/* Return Confirm Dialog */}
      <ReturnConfirmDialog
        open={returnConfirmOpen}
        onOpenChange={setReturnConfirmOpen}
        orderNumber={selected?.order.order_number || ""}
        onConfirm={handleReturnConfirm}
        isProcessing={processingReturn}
      />

      {/* Package Photo Capture */}
      {photoDialog && (
        <PackagePhotoCapture
          open={!!photoDialog}
          onOpenChange={(v) => { if (!v) setPhotoDialog(null); }}
          orderId={photoDialog.assignment.order_id}
          kind={photoDialog.kind}
          title={photoDialog.kind === "pickup" ? "Photo before pickup" : "Photo at delivery"}
          description={photoDialog.kind === "pickup"
            ? "Capture a clear photo of the package before you leave the warehouse."
            : "Capture a photo of the delivered package as proof of delivery."}
          onUploaded={async (url) => {
            const { assignment, nextStatus } = photoDialog;
            setPhotoDialog(null);
            await updateStatus(assignment, nextStatus, url);
          }}
        />
      )}
    </div>
    </MobileAppLayout>
  );
}
