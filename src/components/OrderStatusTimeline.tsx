import { CheckCircle2, Circle, Clock, Package, Truck, MapPin, XCircle, AlertTriangle, RotateCcw, Warehouse } from "lucide-react";

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | "undelivered" | "return_initiated" | "return_in_transit" | "returned";

interface OrderStatusTimelineProps {
  currentStatus: OrderStatus;
  createdAt: string;
}

const normalFlowSteps: { status: OrderStatus; label: string; icon: typeof Circle }[] = [
  { status: "pending", label: "Order Placed", icon: Clock },
  { status: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { status: "processing", label: "Processing", icon: Package },
  { status: "shipped", label: "Shipped", icon: Truck },
  { status: "out_for_delivery", label: "Out for Delivery", icon: MapPin },
  { status: "delivered", label: "Delivered", icon: CheckCircle2 },
];

const returnFlowSteps: { status: OrderStatus; label: string; icon: typeof Circle }[] = [
  { status: "pending", label: "Order Placed", icon: Clock },
  { status: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { status: "processing", label: "Processing", icon: Package },
  { status: "shipped", label: "Shipped", icon: Truck },
  { status: "out_for_delivery", label: "Out for Delivery", icon: MapPin },
  { status: "undelivered", label: "Delivery Failed", icon: AlertTriangle },
  { status: "return_initiated", label: "Return Initiated", icon: RotateCcw },
  { status: "returned", label: "Returned to Warehouse", icon: Warehouse },
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

  // Determine if we're in a return flow
  const isReturnFlow = ["undelivered", "return_initiated", "return_in_transit", "returned"].includes(currentStatus);
  const statusSteps = isReturnFlow ? returnFlowSteps : normalFlowSteps;

  const currentIndex = statusSteps.findIndex(s => s.status === currentStatus);

  // For return_in_transit, show it as between return_initiated and returned
  const displayIndex = currentStatus === "return_in_transit" 
    ? statusSteps.findIndex(s => s.status === "return_initiated") + 0.5
    : currentIndex;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Order Status</h4>
        {isReturnFlow && (
          <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-full">
            Return Flow
          </span>
        )}
      </div>
      <div className="relative">
        {statusSteps.map((step, index) => {
          const isCompleted = index <= displayIndex;
          const isCurrent = index === Math.floor(displayIndex);
          const Icon = step.icon;

          // Determine the color scheme based on return flow
          const isReturnStep = ["undelivered", "return_initiated", "returned"].includes(step.status);
          
          return (
            <div key={step.status} className="flex items-start gap-4 pb-6 last:pb-0">
              {/* Connector line */}
              {index < statusSteps.length - 1 && (
                <div
                  className={`absolute left-3 mt-6 w-0.5 h-6 ${
                    index < displayIndex 
                      ? isReturnStep ? 'bg-amber-500' : 'bg-primary' 
                      : 'bg-muted'
                  }`}
                  style={{ marginLeft: '3px' }}
                />
              )}
              
              {/* Icon */}
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  isCompleted
                    ? isReturnStep 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                } ${isCurrent ? isReturnStep ? 'ring-2 ring-amber-500 ring-offset-2' : 'ring-2 ring-primary ring-offset-2' : ''}`}
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
                  <p className="text-sm text-muted-foreground">
                    {currentStatus === "return_in_transit" && step.status === "return_initiated"
                      ? "Return in transit"
                      : "Current status"
                    }
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
