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
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { maskPhoneNumber } from "@/utils/phoneMasking";
import EarningsSummary from "@/components/delivery/EarningsSummary";

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

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // Check if user is a delivery partner
  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const checkPartner = async () => {
      const { data } = await supabase
        .from("delivery_partners")
        .select("id, is_available")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) {
        toast.error("You are not registered as a delivery partner");
        navigate("/dashboard");
        return;
      }

      setPartnerId(data.id);
      setIsAvailable(data.is_available);
    };

    checkPartner();
  }, [user, navigate]);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["delivery-assignments", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

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

      // Get order details
      const orderIds = data.map(a => a.order_id);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, shipping_address")
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

  const activeAssignments = assignments.filter(a => a.status !== "delivered");
  const completedAssignments = assignments.filter(a => a.status === "delivered");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "assigned": return <Badge className="bg-blue-100 text-blue-800">Assigned</Badge>;
      case "picked_up": return <Badge className="bg-purple-100 text-purple-800">Picked Up</Badge>;
      case "out_for_delivery": return <Badge className="bg-cyan-100 text-cyan-800">Out for Delivery</Badge>;
      case "delivered": return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case "assigned": return { label: "Mark as Picked Up", nextStatus: "picked_up" };
      case "picked_up": return { label: "Out for Delivery", nextStatus: "out_for_delivery" };
      case "out_for_delivery": return { label: "Mark as Delivered", nextStatus: "delivered" };
      default: return null;
    }
  };

  if (!user || !partnerId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Header */}
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
            <TabsList>
              <TabsTrigger value="active">Active ({activeAssignments.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completedAssignments.length})</TabsTrigger>
              <TabsTrigger value="earnings">Earnings</TabsTrigger>
            </TabsList>

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

      <Footer />

      {/* Assignment Details Dialog */}
      <Dialog open={!!selectedAssignment} onOpenChange={() => setSelectedAssignment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Order {selectedAssignment?.order.order_number}</DialogTitle>
          </DialogHeader>
          {selectedAssignment && (
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

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
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
                
                {getNextAction(selectedAssignment.status) && (
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
