import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Clock, MapPin, Phone, Navigation, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { maskPhoneNumber } from "@/utils/phoneMasking";
import { toast } from "sonner";

interface Assignment {
  id: string;
  order_id: string;
  status: string;
  assigned_at: string;
  order: {
    order_number: string;
    total_amount: number;
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
  const navigate = useNavigate();
  const { isOnline, cacheAssignments, getCachedAssignments, saveOffline } = useOfflineStorage();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      const { data } = await supabase
        .from("order_assignments")
        .select("id, order_id, status, assigned_at")
        .eq("delivery_partner_id", partner.id)
        .neq("status", "delivered")
        .order("assigned_at", { ascending: false });

      if (data) {
        const orderIds = data.map(a => a.order_id);
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, total_amount, shipping_address")
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
      const cached = await getCachedAssignments();
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

  const updateStatus = async (assignment: Assignment, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "picked_up") updates.picked_up_at = new Date().toISOString();
    if (newStatus === "delivered") updates.delivered_at = new Date().toISOString();

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

      await supabase
        .from("orders")
        .update({ status: orderStatusMap[newStatus] })
        .eq("id", assignment.order_id);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "assigned": return <Badge className="bg-blue-100 text-blue-800">Assigned</Badge>;
      case "picked_up": return <Badge className="bg-purple-100 text-purple-800">Picked Up</Badge>;
      case "out_for_delivery": return <Badge className="bg-cyan-100 text-cyan-800">Out for Delivery</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case "assigned": return { label: "Pick Up", next: "picked_up" };
      case "picked_up": return { label: "Out for Delivery", next: "out_for_delivery" };
      case "out_for_delivery": return { label: "Delivered", next: "delivered" };
      default: return null;
    }
  };

  const selected = assignments.find(a => a.id === selectedId);

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader 
        title="Active Orders" 
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
                className="cursor-pointer active:bg-muted/50 transition-colors"
                onClick={() => setSelectedId(assignment.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold">{assignment.order.order_number}</p>
                      {getStatusBadge(assignment.status)}
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
                <h3 className="font-semibold text-lg">{selected.order.order_number}</h3>
                {getStatusBadge(selected.status)}
              </div>
              <p className="text-xl font-bold">₹{selected.order.total_amount.toFixed(2)}</p>
            </div>

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

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
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
              
              {getNextAction(selected.status) && (
                <Button
                  className="flex-1"
                  onClick={() => {
                    const action = getNextAction(selected.status);
                    if (action) updateStatus(selected, action.next);
                  }}
                >
                  {getNextAction(selected.status)?.label}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
