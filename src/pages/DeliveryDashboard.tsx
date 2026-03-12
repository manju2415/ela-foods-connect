import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Package, 
  MapPin, 
  Phone, 
  Clock, 
  CheckCircle2,
  Truck,
  Navigation,
  AlertTriangle,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { maskPhoneNumber } from "@/utils/phoneMasking";
import EarningsSummary from "@/components/delivery/EarningsSummary";
import { UndeliveryDialog, type UndeliveryReason } from "@/components/delivery/UndeliveryDialog";
import { ReturnConfirmDialog } from "@/components/delivery/ReturnConfirmDialog";
import { useUndeliveryFlow } from "@/hooks/useUndeliveryFlow";

interface Assignment {
  id: string;
  order_id: string;
  status: string;
  assigned_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  order: {
    order_number: string;
    total_amount: number;
    is_cod?: boolean;
    status?: string;
    shipping_address: {
      full_name?: string;
      phone?: string;
      address_line1?: string;
      address_line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };
  };
}

interface DeliveryDashboardProps {
  hideChrome?: boolean; // Hide Header/Footer when used in mobile app
}

export default function DeliveryDashboard({ hideChrome = false }: DeliveryDashboardProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isCheckingPartner, setIsCheckingPartner] = useState(true);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [partnerCheckKey, setPartnerCheckKey] = useState(0);
  
  // Undelivery flow state
  const [undeliveryDialogOpen, setUndeliveryDialogOpen] = useState(false);
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [processingReturn, setProcessingReturn] = useState(false);
  
  // Undelivery flow hook
  const { markAsUndelivered, markReturnCompleted } = useUndeliveryFlow(partnerId, () => {
    queryClient.invalidateQueries({ queryKey: ["delivery-assignments"] });
  });

  // Check if user is a delivery partner - wait for auth to finish loading first
  useEffect(() => {
    // Don't do anything until auth loading is complete
    if (authLoading) return;
    
    if (!user) {
      // Preserve the current path for redirect after login
      const currentPath = window.location.pathname;
      navigate(`/auth?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    const checkPartner = async () => {
      setIsCheckingPartner(true);
      setPartnerError(null);

      try {
        const { data, error } = await supabase
          .from("delivery_partners")
          .select("id, is_available")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error loading delivery partner record:", error);
          setPartnerId(null);
          setPartnerError("We couldn't load your delivery partner profile. Please check your connection and try again.");
          setIsCheckingPartner(false);
          return;
        }

        if (!data) {
          // IMPORTANT: Don't bounce the user into the customer dashboard.
          // In the driver app, keep them here and show a clear explanation.
          setPartnerId(null);
          setPartnerError("This account is not registered as a delivery partner.");
          setIsCheckingPartner(false);
          return;
        }

        setPartnerId(data.id);
        setIsAvailable(data.is_available ?? true);
        setIsCheckingPartner(false);
      } catch (err) {
        console.error("Unexpected error checking partner:", err);
        setPartnerId(null);
        setPartnerError("An unexpected error occurred. Please try again.");
        setIsCheckingPartner(false);
      }
    };

    checkPartner();
  }, [user, authLoading, navigate, partnerCheckKey]);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["delivery-assignments", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      try {
        const { data, error } = await supabase
          .from("order_assignments")
          .select(`
            id,
            order_id,
            status,
            assigned_at,
            picked_up_at,
            delivered_at
          `)
          .eq("delivery_partner_id", partnerId)
          .order("assigned_at", { ascending: false });

        if (error) throw error;

        // Get order details - handle empty orderIds
        const orderIds = data?.map(a => a.order_id) || [];
        if (orderIds.length === 0) return [];
        
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, total_amount, shipping_address, is_cod, status")
          .in("id", orderIds);

        const ordersMap = new Map(orders?.map(o => [o.id, o]) || []);

        return data.map(assignment => ({
          ...assignment,
          order: ordersMap.get(assignment.order_id) || {
            order_number: "N/A",
            total_amount: 0,
            shipping_address: {},
          },
        })) as Assignment[];
      } catch (err) {
        console.error("Error fetching assignments:", err);
        return [];
      }
    },
    enabled: !!partnerId,
  });

  const toggleAvailability = useMutation({
    mutationFn: async (available: boolean) => {
      if (!partnerId) return;
      const { error } = await supabase
        .from("delivery_partners")
        .update({ is_available: available })
        .eq("id", partnerId);
      if (error) throw error;
    },
    onSuccess: (_, available) => {
      setIsAvailable(available);
      toast.success(available ? "You are now available for deliveries" : "You are now offline");
    },
    onError: () => {
      toast.error("Failed to update availability");
    },
  });

  const updateAssignmentStatus = useMutation({
    mutationFn: async ({ assignmentId, status, orderId }: { 
      assignmentId: string; 
      status: string;
      orderId: string;
    }) => {
      const updates: any = { status };
      
      if (status === "picked_up") {
        updates.picked_up_at = new Date().toISOString();
      } else if (status === "delivered") {
        updates.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("order_assignments")
        .update(updates)
        .eq("id", assignmentId);
      
      if (error) throw error;

      // Update order status
      type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled";
      let orderStatus: OrderStatus = "processing";
      if (status === "picked_up") orderStatus = "shipped";
      else if (status === "out_for_delivery") orderStatus = "out_for_delivery";
      else if (status === "delivered") orderStatus = "delivered";

      await supabase
        .from("orders")
        .update({ status: orderStatus })
        .eq("id", orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-assignments"] });
      toast.success("Status updated successfully");
      setSelectedAssignment(null);
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  const activeAssignments = assignments.filter(a => 
    a.status !== "delivered" && a.status !== "returned"
  );
  const completedAssignments = assignments.filter(a => 
    a.status === "delivered" || a.status === "returned"
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "assigned": return <Badge className="bg-blue-100 text-blue-800">Assigned</Badge>;
      case "picked_up": return <Badge className="bg-purple-100 text-purple-800">Picked Up</Badge>;
      case "out_for_delivery": return <Badge className="bg-cyan-100 text-cyan-800">Out for Delivery</Badge>;
      case "delivered": return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
      case "undelivered": return <Badge className="bg-amber-100 text-amber-800">Undelivered</Badge>;
      case "return_initiated": return <Badge className="bg-orange-100 text-orange-800">Return Pending</Badge>;
      case "return_in_transit": return <Badge className="bg-yellow-100 text-yellow-800">Returning</Badge>;
      case "returned": return <Badge className="bg-slate-100 text-slate-800">Returned</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case "assigned": return { label: "Mark as Picked Up", nextStatus: "picked_up" };
      case "picked_up": return { label: "Out for Delivery", nextStatus: "out_for_delivery" };
      case "out_for_delivery": return { label: "Mark as Delivered", nextStatus: "delivered" };
      case "return_initiated": 
      case "undelivered": 
        return { label: "Return to Warehouse", nextStatus: "return_in_transit" };
      case "return_in_transit": return { label: "Confirm Return", nextStatus: "returned" };
      default: return null;
    }
  };
  
  // Handler for undelivery confirmation
  const handleUndeliveryConfirm = async (reason: UndeliveryReason, notes: string) => {
    if (!selectedAssignment) return;
    await markAsUndelivered(selectedAssignment, reason, notes);
    setUndeliveryDialogOpen(false);
    setSelectedAssignment(null);
  };
  
  // Handler for return confirmation
  const handleReturnConfirm = async () => {
    if (!selectedAssignment) return;
    setProcessingReturn(true);
    try {
      await markReturnCompleted(selectedAssignment);
      setReturnConfirmOpen(false);
      setSelectedAssignment(null);
    } finally {
      setProcessingReturn(false);
    }
  };

  // Show loading state while auth is loading or partner check is in progress
  if (authLoading || isCheckingPartner) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: hideChrome ? '#16a34a' : undefined }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
          {hideChrome && <p className="text-white/80 text-sm">Loading dashboard...</p>}
        </div>
      </div>
    );
  }

  // If auth is resolved but user is missing, DriverApp / this page will redirect to /auth.
  if (!user) return null;

  // Auth is ready, partner check finished, but we couldn't resolve a delivery partner.
  if (!partnerId) {
    return (
      <div className={`min-h-screen flex flex-col bg-background ${hideChrome ? 'safe-area-pt' : ''}`}>
        {!hideChrome && <Header />}
        <main className={`flex-1 container mx-auto px-4 ${hideChrome ? 'pt-8 pb-24' : 'py-8'}`}>
          <Card className="max-w-lg mx-auto">
            <CardHeader>
              <CardTitle>Unable to open Driver Dashboard</CardTitle>
              <CardDescription>
                {partnerError ?? "We couldn't verify your delivery partner access."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setPartnerCheckKey((k) => k + 1)}>
                Retry
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut();
                  navigate("/auth?redirect=/driver-app", { replace: true });
                }}
              >
                Sign in with another account
              </Button>
            </CardContent>
          </Card>
        </main>
        {!hideChrome && <Footer />}
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col bg-background ${hideChrome ? 'safe-area-pt' : ''}`}>
      {!hideChrome && <Header />}
      
      {/* Mobile app header with safe area padding for status bar */}
      {hideChrome && (
        <div className="bg-green-600 px-4 py-4">
          <h1 className="text-xl font-bold text-white">Delivery Dashboard</h1>
          <p className="text-white/80 text-sm">Manage your assigned deliveries</p>
        </div>
      )}
      
      <main className={`flex-1 container mx-auto px-4 ${hideChrome ? 'pt-4 pb-24' : 'py-8'}`}>
        <div className="space-y-6">
          {/* Header - only show when not in mobile app mode */}
          {!hideChrome && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">Delivery Dashboard</h1>
                <p className="text-muted-foreground">Manage your assigned deliveries</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="availability"
                    checked={isAvailable}
                    onCheckedChange={(checked) => toggleAvailability.mutate(checked)}
                  />
                  <Label htmlFor="availability">
                    {isAvailable ? "Available" : "Offline"}
                  </Label>
                </div>
              </div>
            </div>
          )}
          
          {/* Availability toggle for mobile app mode */}
          {hideChrome && (
            <div className="flex items-center justify-end">
              <div className="flex items-center space-x-2">
                <Switch
                  id="availability-mobile"
                  checked={isAvailable}
                  onCheckedChange={(checked) => toggleAvailability.mutate(checked)}
                />
                <Label htmlFor="availability-mobile">
                  {isAvailable ? "Available" : "Offline"}
                </Label>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Active Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{activeAssignments.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Completed Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {completedAssignments.filter(a => 
                    a.delivered_at && new Date(a.delivered_at).toDateString() === new Date().toDateString()
                  ).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Total Deliveries
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{completedAssignments.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Assignments Tabs */}
          <Tabs defaultValue="active">
            <div className="overflow-x-auto -mx-4 px-4 pb-2">
              <TabsList className="inline-flex w-max gap-1">
                <TabsTrigger value="active" className="px-4">Active ({activeAssignments.length})</TabsTrigger>
                <TabsTrigger value="completed" className="px-4">Completed ({completedAssignments.length})</TabsTrigger>
                <TabsTrigger value="earnings" className="px-4">Earnings</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="active" className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : activeAssignments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No active assignments
                  </CardContent>
                </Card>
              ) : (
                activeAssignments.map(assignment => (
                  <Card key={assignment.id} className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedAssignment(assignment)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{assignment.order.order_number}</span>
                            {getStatusBadge(assignment.status)}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {assignment.order.shipping_address?.address_line1}, {assignment.order.shipping_address?.city}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Assigned: {format(new Date(assignment.assigned_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">₹{Number(assignment.order.total_amount).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedAssignments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No completed deliveries yet
                  </CardContent>
                </Card>
              ) : (
                completedAssignments.slice(0, 10).map(assignment => (
                  <Card key={assignment.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{assignment.order.order_number}</span>
                            {getStatusBadge(assignment.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {assignment.order.shipping_address?.city}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Delivered: {assignment.delivered_at && format(new Date(assignment.delivered_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <p className="font-semibold">₹{Number(assignment.order.total_amount).toFixed(2)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="earnings">
              {partnerId && <EarningsSummary partnerId={partnerId} />}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {!hideChrome && <Footer />}

      {/* Assignment Details Dialog */}
      {selectedAssignment && (
        <Dialog open onOpenChange={() => setSelectedAssignment(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Order {selectedAssignment.order.order_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                {getStatusBadge(selectedAssignment.status)}
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-medium">Delivery Address</h4>
                <p className="font-medium">{selectedAssignment.order.shipping_address?.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAssignment.order.shipping_address?.address_line1}
                  {selectedAssignment.order.shipping_address?.address_line2 && (
                    <>, {selectedAssignment.order.shipping_address.address_line2}</>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedAssignment.order.shipping_address?.city}, {selectedAssignment.order.shipping_address?.state} - {selectedAssignment.order.shipping_address?.postal_code}
                </p>
                {selectedAssignment.order.shipping_address?.phone && (
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {maskPhoneNumber(selectedAssignment.order.shipping_address.phone)}
                    </p>
                    <a 
                      href={`tel:${selectedAssignment.order.shipping_address.phone}`}
                      className="inline-flex items-center gap-2 text-primary text-sm"
                    >
                      <Phone className="h-3 w-3" />
                      Call Customer
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-muted-foreground">Order Amount</span>
                <span className="text-xl font-bold">₹{Number(selectedAssignment.order.total_amount).toFixed(2)}</span>
              </div>
              
              {/* COD indicator */}
              {selectedAssignment.order.is_cod && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    COD Order - Collect ₹{Number(selectedAssignment.order.total_amount).toFixed(2)} on delivery
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {/* Navigation button */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const addr = selectedAssignment.order.shipping_address;
                    const query = encodeURIComponent(
                      `${addr?.address_line1}, ${addr?.city}, ${addr?.state} ${addr?.postal_code}`
                    );
                    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
                  }}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Navigate
                </Button>
                
                {/* Action buttons row */}
                <div className="flex gap-2">
                  {/* Undelivered button - only show for out_for_delivery status */}
                  {selectedAssignment.status === "out_for_delivery" && (
                    <Button
                      variant="outline"
                      className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setUndeliveryDialogOpen(true)}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Undelivered
                    </Button>
                  )}
                  
                  {/* Return to warehouse button - for return_initiated or undelivered */}
                  {(selectedAssignment.status === "return_initiated" || 
                    selectedAssignment.status === "undelivered") && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        updateAssignmentStatus.mutate({
                          assignmentId: selectedAssignment.id,
                          status: "return_in_transit",
                          orderId: selectedAssignment.order_id,
                        });
                      }}
                      disabled={updateAssignmentStatus.isPending}
                    >
                      <Truck className="h-4 w-4 mr-2" />
                      {updateAssignmentStatus.isPending ? "Updating..." : "Return to Warehouse"}
                    </Button>
                  )}
                  
                  {/* Confirm return button */}
                  {selectedAssignment.status === "return_in_transit" && (
                    <Button
                      className="flex-1"
                      onClick={() => setReturnConfirmOpen(true)}
                    >
                      <Warehouse className="h-4 w-4 mr-2" />
                      Confirm Return
                    </Button>
                  )}
                  
                  {/* Standard next action button */}
                  {getNextAction(selectedAssignment.status) && 
                   selectedAssignment.status !== "return_initiated" &&
                   selectedAssignment.status !== "undelivered" &&
                   selectedAssignment.status !== "return_in_transit" && (
                    <Button
                      className="flex-1"
                      onClick={() => {
                        const action = getNextAction(selectedAssignment.status);
                        if (action) {
                          updateAssignmentStatus.mutate({
                            assignmentId: selectedAssignment.id,
                            status: action.nextStatus,
                            orderId: selectedAssignment.order_id,
                          });
                        }
                      }}
                      disabled={updateAssignmentStatus.isPending}
                    >
                      {updateAssignmentStatus.isPending ? "Updating..." : getNextAction(selectedAssignment.status)?.label}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Undelivery Dialog */}
      {selectedAssignment && (
        <UndeliveryDialog
          open={undeliveryDialogOpen}
          onOpenChange={setUndeliveryDialogOpen}
          orderNumber={selectedAssignment.order.order_number}
          isCOD={selectedAssignment.order.is_cod}
          onConfirm={handleUndeliveryConfirm}
        />
      )}
      
      {/* Return Confirm Dialog */}
      {selectedAssignment && (
        <ReturnConfirmDialog
          open={returnConfirmOpen}
          onOpenChange={setReturnConfirmOpen}
          orderNumber={selectedAssignment.order.order_number}
          onConfirm={handleReturnConfirm}
          isProcessing={processingReturn}
        />
      )}
    </div>
  );
}
