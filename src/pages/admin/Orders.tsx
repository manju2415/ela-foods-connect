import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminMobileCard, AdminMobileField } from "@/components/admin/AdminMobileCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import { Search, Eye, Package, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Database } from "@/integrations/supabase/types";
import { InvoiceButton } from "@/components/InvoiceButton";
import { orderPaymentMethodLabel, orderValue } from "@/lib/paymentMethod";

type OrderStatus = Database["public"]["Enums"]["order_status"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];

interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  wallet_amount_used?: number | null;
  is_cod?: boolean | null;
  shipping_amount: number;
  shipping_address: {
    full_name?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  notes: string | null;
  created_at: string;
  user_id: string;
  preferred_delivery_date?: string | null;
  preferred_delivery_slot_id?: string | null;
  delivery_slot?: { name: string; start_time: string; end_time: string } | null;
  profiles?: { email: string; full_name: string | null } | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  product_price: number;
  total_price: number;
}

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "undelivered", "return_initiated", "return_in_transit", "returned"];
const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "completed", "failed", "refunded"];

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  processing: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  shipped: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  out_for_delivery: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  undelivered: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  return_initiated: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  return_in_transit: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  returned: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const paymentColors: Record<PaymentStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  refunded: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export default function Orders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      // First get orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .is("admin_deleted_at", null)
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Get unique user IDs and fetch profiles
      const userIds = [...new Set(ordersData.map((o) => o.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);

      const { data: slotsData } = await supabase
        .from("delivery_time_slots")
        .select("id, name, start_time, end_time");
      const slotsMap = new Map(slotsData?.map((s) => [s.id, s]) || []);

      return ordersData.map((order) => ({
        ...order,
        shipping_address: order.shipping_address as Order["shipping_address"],
        profiles: profilesMap.get(order.user_id) || null,
        delivery_slot: order.preferred_delivery_slot_id
          ? slotsMap.get(order.preferred_delivery_slot_id) || null
          : null,
      })) as Order[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order status updated");
    },
    onError: () => {
      toast.error("Failed to update order status");
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ orderId, payment_status }: { orderId: string; payment_status: PaymentStatus }) => {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Payment status updated");
    },
    onError: () => {
      toast.error("Failed to update payment status");
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (order: Order) => {
      const { data, error } = await supabase.rpc("admin_delete_order", { p_order_id: order.id });
      if (error) throw error;
      if (!data) throw new Error("Order not found or already deleted. Refresh the list and try again.");
      return order;
    },
    onSuccess: (order) => {
      queryClient.setQueryData<Order[]>(["admin-orders"], (current) =>
        current?.filter((item) => item.id !== order.id));
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
      setOrderToDelete(null);
      toast.success(`Order ${order.order_number} removed from the admin list`);
    },
    onError: (error: Error) => toast.error(`Could not delete order: ${error.message}`),
  });

  const deleteButton = (order: Order) => (
    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
      aria-label={`Delete order ${order.order_number}`}
      disabled={deleteOrderMutation.isPending}
      onClick={() => setOrderToDelete(order)}>
      <Trash2 className="h-4 w-4 mr-1" /> Delete
    </Button>
  );

  const fetchOrderItems = async (orderId: string) => {
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (error) {
      toast.error("Failed to load order items");
      return;
    }
    setOrderItems(data || []);
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    fetchOrderItems(order.id);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(search.toLowerCase()) ||
      order.profiles?.email?.toLowerCase().includes(search.toLowerCase()) ||
      order.profiles?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-muted-foreground">Manage and track customer orders</p>
          </div>
        </div>

        <Card className="max-w-full overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                All Orders ({filteredOrders.length})
              </CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders found
              </div>
            ) : (
              <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{order.profiles?.full_name || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">{order.profiles?.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{format(new Date(order.created_at), "MMM d, yyyy")}</div>
                          {(order.preferred_delivery_date || order.delivery_slot) && (
                            <div className="text-xs text-muted-foreground">
                              Deliver: {order.preferred_delivery_date ? format(new Date(order.preferred_delivery_date), "MMM d") : "—"}
                              {order.delivery_slot ? ` · ${order.delivery_slot.name}` : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>₹{orderValue(order).toFixed(2)}</TableCell>
                        <TableCell>
                          <Select
                            value={order.status}
                            onValueChange={(value: OrderStatus) =>
                              updateStatusMutation.mutate({ orderId: order.id, status: value })
                            }
                          >
                            <SelectTrigger className="w-32 h-8">
                              <Badge className={statusColors[order.status]} variant="secondary">
                                {order.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status.charAt(0).toUpperCase() + status.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={order.payment_status}
                            onValueChange={(value: PaymentStatus) =>
                              updatePaymentMutation.mutate({ orderId: order.id, payment_status: value })
                            }
                          >
                            <SelectTrigger className="w-28 h-8">
                              <Badge className={paymentColors[order.payment_status]} variant="secondary">
                                {order.payment_status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status.charAt(0).toUpperCase() + status.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{orderPaymentMethodLabel(order)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewOrder(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {deleteButton(order)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {filteredOrders.map((order) => (
                  <AdminMobileCard key={order.id}>
                    <div className="flex justify-end">{deleteButton(order)}</div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium break-all">{order.order_number}</div>
                        <div className="text-sm text-muted-foreground break-words">{order.profiles?.full_name || "N/A"}</div>
                        <div className="text-xs text-muted-foreground break-all">{order.profiles?.email}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleViewOrder(order)} className="shrink-0">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AdminMobileField label="Date">{format(new Date(order.created_at), "MMM d, yyyy")}</AdminMobileField>
                      <AdminMobileField label="Total">₹{orderValue(order).toFixed(2)}</AdminMobileField>
                    </div>
                    <AdminMobileField label="Status">
                      <Select value={order.status} onValueChange={(value: OrderStatus) => updateStatusMutation.mutate({ orderId: order.id, status: value })}>
                        <SelectTrigger className="h-9 w-full"><Badge className={statusColors[order.status]} variant="secondary">{order.status}</Badge></SelectTrigger>
                        <SelectContent>{ORDER_STATUSES.map((status) => <SelectItem key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent>
                      </Select>
                    </AdminMobileField>
                    <AdminMobileField label="Payment">
                      <Select value={order.payment_status} onValueChange={(value: PaymentStatus) => updatePaymentMutation.mutate({ orderId: order.id, payment_status: value })}>
                        <SelectTrigger className="h-9 w-full"><Badge className={paymentColors[order.payment_status]} variant="secondary">{order.payment_status}</Badge></SelectTrigger>
                        <SelectContent>{PAYMENT_STATUSES.map((status) => <SelectItem key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent>
                      </Select>
                    </AdminMobileField>
                    <AdminMobileField label="Payment Method">{orderPaymentMethodLabel(order)}</AdminMobileField>
                  </AdminMobileCard>
                ))}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!orderToDelete} onOpenChange={(open) => {
          if (!open && !deleteOrderMutation.isPending) setOrderToDelete(null);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete order {orderToDelete?.order_number}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the order from the admin orders list. Customer order history,
                invoices, and payment records are retained. This does not cancel delivery,
                refund payments, or restore stock. There is no restore option on this page.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteOrderMutation.isPending}>Keep order</AlertDialogCancel>
              <Button variant="destructive" disabled={deleteOrderMutation.isPending}
                onClick={() => orderToDelete && deleteOrderMutation.mutate(orderToDelete)}>
                {deleteOrderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {deleteOrderMutation.isPending ? "Deleting..." : "Delete order"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order Details - {selectedOrder?.order_number}</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Customer</h4>
                    <p>{selectedOrder.profiles?.full_name || "N/A"}</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.profiles?.email}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Shipping Address</h4>
                    <p>{selectedOrder.shipping_address?.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrder.shipping_address?.address_line1}, {selectedOrder.shipping_address?.city}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrder.shipping_address?.state} - {selectedOrder.shipping_address?.postal_code}
                    </p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.shipping_address?.phone}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Preferred Delivery</h4>
                  <p className="text-sm">
                    {selectedOrder.preferred_delivery_date
                      ? format(new Date(selectedOrder.preferred_delivery_date), "EEE, MMM d, yyyy")
                      : "No date selected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedOrder.delivery_slot
                      ? `${selectedOrder.delivery_slot.name} (${selectedOrder.delivery_slot.start_time?.slice(0, 5)} - ${selectedOrder.delivery_slot.end_time?.slice(0, 5)})`
                      : "No time slot selected"}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Order Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-right">₹{Number(item.product_price).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">₹{Number(item.total_price).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span>Payment Method</span>
                    <span className="font-medium">{orderPaymentMethodLabel(selectedOrder)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{Number(selectedOrder.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>₹{Number(selectedOrder.shipping_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-₹{Number(selectedOrder.discount_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span>Order Value</span>
                    <span>₹{orderValue(selectedOrder).toFixed(2)}</span>
                  </div>
                  {Number(selectedOrder.wallet_amount_used || 0) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Paid from wallet</span>
                      <span>₹{Number(selectedOrder.wallet_amount_used).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(selectedOrder.total_amount || 0) > 0 && Number(selectedOrder.wallet_amount_used || 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{selectedOrder.payment_status === "completed" ? "Charged online" : selectedOrder.status === "cancelled" ? "Online payment not completed" : "Awaiting online payment"}</span>
                      <span>₹{Number(selectedOrder.total_amount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <InvoiceButton orderId={selectedOrder.id} />

                {selectedOrder.notes && (
                  <div>
                    <h4 className="font-medium mb-2">Notes</h4>
                    <p className="text-muted-foreground">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
