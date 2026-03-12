import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { ReturnRequestDialog } from "@/components/ReturnRequestDialog";
import { Package, MapPin, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  subtotal: number;
  shipping_amount: number | null;
  discount_amount: number | null;
  created_at: string;
  shipping_address: {
    full_name?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
}

interface OrderItem {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  total_price: number;
}

export default function CustomerOrderDetailPage() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!user || !orderId) return;

    setLoading(true);
    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId),
    ]);

    if (orderRes.data) {
      setOrder({
        ...orderRes.data,
        shipping_address: orderRes.data.shipping_address as Order["shipping_address"],
      });
    }

    if (itemsRes.data) {
      setOrderItems(itemsRes.data);
    }

    setLoading(false);
  }, [user, orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "processing": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "shipped": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
      case "out_for_delivery": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const formatStatus = (status: string) => {
    return status.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium mb-2">Sign in to view order</h2>
        <button
          onClick={() => navigate("/auth?redirect=/customer-app/orders")}
          className="text-primary underline"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="Order Details" showBack />

      <div className="p-4 space-y-4">
        {loading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : !order ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Order not found</h2>
          </div>
        ) : (
          <>
            {/* Order Header */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-lg">{order.order_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(order.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <Badge className={getStatusColor(order.status)}>
                    {formatStatus(order.status)}
                  </Badge>
                </div>

                {/* Order Timeline */}
                <OrderStatusTimeline currentStatus={order.status as any} createdAt={order.created_at} />
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Items</h3>
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          ₹{item.product_price} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium">₹{item.total_price.toFixed(2)}</p>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                {/* Order Summary */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{order.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>₹{(order.shipping_amount || 0).toFixed(2)}</span>
                  </div>
                  {order.discount_amount && order.discount_amount > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Discount</span>
                      <span>-₹{order.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>₹{order.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shipping Address */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Shipping Address
                </h3>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{order.shipping_address?.full_name}</p>
                  <p className="text-muted-foreground">{order.shipping_address?.address_line1}</p>
                  <p className="text-muted-foreground">
                    {order.shipping_address?.city}, {order.shipping_address?.state} - {order.shipping_address?.postal_code}
                  </p>
                  <p className="text-muted-foreground">{order.shipping_address?.phone}</p>
                </div>
              </CardContent>
            </Card>

            {/* Return/Exchange Button - only for delivered orders */}
            {order.status === "delivered" && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setIsReturnDialogOpen(true)}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Request Return/Exchange
              </Button>
            )}
          </>
        )}
      </div>

      {/* Return Request Dialog */}
      {order && (
        <ReturnRequestDialog
          open={isReturnDialogOpen}
          onOpenChange={setIsReturnDialogOpen}
          orderId={order.id}
          orderNumber={order.order_number}
          orderItems={orderItems.map(item => ({
            id: item.id,
            product_name: item.product_name,
            quantity: item.quantity,
            product_price: item.product_price,
          }))}
          onSuccess={fetchOrder}
        />
      )}
    </div>
  );
}
