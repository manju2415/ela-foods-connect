import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardList, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  shipping_address: { full_name?: string; city?: string };
  created_at: string;
  assignment?: {
    id: string;
    status: string;
    delivery_partner_id: string;
    partner_name?: string;
  } | null;
}

interface DeliveryPartner {
  id: string;
  user_id: string;
  is_available: boolean;
  profile?: { full_name: string | null };
}

export default function OrderAssignments() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders-for-assignment"],
    queryFn: async () => {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("id, order_number, status, total_amount, shipping_address, created_at")
        .in("status", ["confirmed", "processing", "shipped", "out_for_delivery"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get assignments
      const orderIds = ordersData.map(o => o.id);
      const { data: assignments } = await supabase
        .from("order_assignments")
        .select("id, order_id, status, delivery_partner_id")
        .in("order_id", orderIds);

      // Get partner details
      const partnerIds = [...new Set(assignments?.map(a => a.delivery_partner_id) || [])];
      const { data: partners } = partnerIds.length > 0 ? await supabase
        .from("delivery_partners")
        .select("id, user_id")
        .in("id", partnerIds) : { data: [] };

      const userIds = partners?.map(p => p.user_id) || [];
      const { data: profiles } = userIds.length > 0 ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds) : { data: [] };

      const profilesMap = new Map<string, string | null>();
      profiles?.forEach(p => profilesMap.set(p.id, p.full_name));
      
      const partnersMap = new Map<string, string | null>();
      partners?.forEach(p => partnersMap.set(p.id, profilesMap.get(p.user_id) || null));
      
      const assignmentsMap = new Map<string, { id: string; order_id: string; status: string; delivery_partner_id: string; partner_name: string }>();
      assignments?.forEach(a => {
        assignmentsMap.set(a.order_id, {
          ...a,
          partner_name: partnersMap.get(a.delivery_partner_id) || "Unknown",
        });
      });

      return ordersData.map(order => ({
        ...order,
        shipping_address: order.shipping_address as Order["shipping_address"],
        assignment: assignmentsMap.get(order.id) || null,
      })) as Order[];
    },
  });

  const { data: availablePartners = [] } = useQuery({
    queryKey: ["available-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_partners")
        .select("id, user_id, is_available")
        .eq("is_available", true);

      if (error) throw error;

      const userIds = data.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(partner => ({
        ...partner,
        profile: profilesMap.get(partner.user_id) || null,
      })) as DeliveryPartner[];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId, partnerId }: { orderId: string; partnerId: string }) => {
      // Check if already assigned
      const { data: existing } = await supabase
        .from("order_assignments")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();

      if (existing) {
        // Update existing assignment
        const { error } = await supabase
          .from("order_assignments")
          .update({ delivery_partner_id: partnerId, status: "assigned" })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Create new assignment
        const { error } = await supabase
          .from("order_assignments")
          .insert({ order_id: orderId, delivery_partner_id: partnerId });
        if (error) throw error;
      }

      // Update order status
      await supabase
        .from("orders")
        .update({ status: "processing" })
        .eq("id", orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders-for-assignment"] });
      toast.success("Order assigned successfully");
      setSelectedOrder(null);
      setSelectedPartner("");
    },
    onError: () => {
      toast.error("Failed to assign order");
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "processing": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "shipped": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
      case "out_for_delivery": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200";
      default: return "bg-muted";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order Assignments</h1>
          <p className="text-muted-foreground">Assign orders to delivery partners</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Orders Pending Assignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders pending assignment
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>
                        <div>
                          <div>{order.shipping_address?.full_name || "N/A"}</div>
                          <div className="text-sm text-muted-foreground">
                            {order.shipping_address?.city}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>₹{Number(order.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(order.status)} variant="secondary">
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.assignment ? (
                          <span className="text-sm">{order.assignment.partner_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          {order.assignment ? "Reassign" : "Assign"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Order {selectedOrder?.order_number}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delivery partner" />
                </SelectTrigger>
                <SelectContent>
                  {availablePartners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.profile?.full_name || "Unknown Partner"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availablePartners.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  No available delivery partners
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedOrder &&
                  selectedPartner &&
                  assignMutation.mutate({
                    orderId: selectedOrder.id,
                    partnerId: selectedPartner,
                  })
                }
                disabled={!selectedPartner || assignMutation.isPending}
              >
                {assignMutation.isPending ? "Assigning..." : "Assign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
