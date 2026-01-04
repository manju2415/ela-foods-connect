import { CheckCircle2, Circle, Clock, Package, Truck, MapPin, XCircle } from "lucide-react";

type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled";

interface OrderStatusTimelineProps {
  currentStatus: OrderStatus;
  createdAt: string;
}

const statusSteps: { status: OrderStatus; label: string; icon: typeof Circle }[] = [
  { status: "pending", label: "Order Placed", icon: Clock },
  { status: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { status: "processing", label: "Processing", icon: Package },
  { status: "shipped", label: "Shipped", icon: Truck },
  { status: "out_for_delivery", label: "Out for Delivery", icon: MapPin },
  { status: "delivered", label: "Delivered", icon: CheckCircle2 },
];

export function OrderStatusTimeline({ currentStatus, createdAt }: OrderStatusTimelineProps) {
  if (currentStatus === "cancelled") {
    return (
      <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
        <XCircle className="h-6 w-6 text-destructive" />
        <div>
          <p className="font-medium text-destructive">Order Cancelled</p>
          <p className="text-sm text-muted-foreground">This order has been cancelled</p>
        </div>
      </div>
    );
  }

  const currentIndex = statusSteps.findIndex(s => s.status === currentStatus);

  return (
    <div className="space-y-4">
      <h4 className="font-semibold">Order Status</h4>
      <div className="relative">
        {statusSteps.map((step, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.status} className="flex items-start gap-4 pb-6 last:pb-0">
              {/* Connector line */}
              {index < statusSteps.length - 1 && (
                <div
                  className={`absolute left-3 mt-6 w-0.5 h-6 ${
                    index < currentIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                  style={{ marginLeft: '3px' }}
                />
              )}
              
              {/* Icon */}
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                } ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              >
                <Icon className="h-4 w-4" />
              </div>

              {/* Label */}
              <div className="flex-1">
                <p
                  className={`font-medium ${
                    isCompleted ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-sm text-muted-foreground">Current status</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
