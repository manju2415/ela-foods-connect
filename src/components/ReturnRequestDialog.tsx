import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { CalendarIcon, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  product_price: number;
}

interface TimeSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface Address {
  id: string;
  label: string;
  full_name: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
}

interface ReturnRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  orderItems: OrderItem[];
  onSuccess?: () => void;
}

export function ReturnRequestDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  orderItems,
  onSuccess,
}: ReturnRequestDialogProps) {
  const [requestType, setRequestType] = useState<"return" | "exchange" | "refund">("return");
  const [selectedItem, setSelectedItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Pickup scheduling
  const [pickupDate, setPickupDate] = useState<Date | undefined>();
  const [pickupSlotId, setPickupSlotId] = useState("");
  const [pickupAddressId, setPickupAddressId] = useState("");
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);

  const selectedOrderItem = orderItems.find((item) => item.id === selectedItem);
  const maxQuantity = selectedOrderItem?.quantity || 1;
  
  // Determine if pickup is needed (return or exchange)
  const needsPickup = requestType === "return" || requestType === "exchange";

  // Fetch time slots and addresses
  useEffect(() => {
    if (open && needsPickup) {
      fetchTimeSlots();
      fetchAddresses();
    }
  }, [open, needsPickup]);

  const fetchTimeSlots = async () => {
    const { data } = await supabase
      .from("delivery_time_slots")
      .select("id, name, start_time, end_time")
      .eq("is_active", true)
      .order("display_order");
    if (data) setTimeSlots(data);
  };

  const fetchAddresses = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("addresses")
      .select("id, label, full_name, address_line1, city, state, postal_code")
      .eq("user_id", user.id);
    if (data) setAddresses(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedItem) {
      toast.error("Please select a product");
      return;
    }
    
    if (!reason.trim()) {
      toast.error("Please provide a reason");
      return;
    }

    // Validate pickup fields for return/exchange
    if (needsPickup) {
      if (!pickupDate) {
        toast.error("Please select a pickup date");
        return;
      }
      if (!pickupSlotId) {
        toast.error("Please select a pickup time slot");
        return;
      }
      if (!pickupAddressId) {
        toast.error("Please select a pickup address");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the selected address details
      const selectedAddress = addresses.find(a => a.id === pickupAddressId);
      
      const insertData: TablesInsert<"return_requests"> = {
        order_id: orderId,
        order_item_id: selectedItem,
        user_id: user.id,
        request_type: requestType,
        quantity: parseInt(quantity),
        reason: reason.trim(),
      };

      // Add pickup details if needed
      if (needsPickup && selectedAddress) {
        insertData.pickup_date = format(pickupDate!, "yyyy-MM-dd");
        insertData.pickup_slot_id = pickupSlotId;
        insertData.pickup_address = {
          full_name: selectedAddress.full_name,
          address_line1: selectedAddress.address_line1,
          city: selectedAddress.city,
          state: selectedAddress.state,
          postal_code: selectedAddress.postal_code,
        };
        insertData.status = "pickup_scheduled";
      }

      const { error } = await supabase.from("return_requests").insert(insertData);

      if (error) throw error;

      toast.success(
        needsPickup 
          ? "Request submitted! Pickup scheduled successfully." 
          : "Refund request submitted successfully"
      );
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedItem("");
    setQuantity("1");
    setReason("");
    setRequestType("return");
    setPickupDate(undefined);
    setPickupSlotId("");
    setPickupAddressId("");
  };

  // Minimum pickup date is tomorrow
  const minPickupDate = addDays(new Date(), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Return/Exchange/Refund</DialogTitle>
          <p className="text-sm text-muted-foreground">Order: {orderNumber}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Request Type</Label>
            <Select value={requestType} onValueChange={(v: "return" | "exchange" | "refund") => setRequestType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="return">Return (get refund)</SelectItem>
                <SelectItem value="exchange">Exchange (get replacement)</SelectItem>
                <SelectItem value="refund">Refund Only (no pickup needed)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Select Product *</Label>
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {orderItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.product_name} (Qty: {item.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity</Label>
            <Select value={quantity} onValueChange={setQuantity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    {num}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please describe why you want to return/exchange this item..."
              rows={3}
              required
            />
          </div>

          {/* Pickup Scheduling Section */}
          {needsPickup && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Truck className="h-4 w-4" />
                Schedule Pickup
              </div>

              <div className="space-y-2">
                <Label>Pickup Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !pickupDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {pickupDate ? format(pickupDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={pickupDate}
                      onSelect={setPickupDate}
                      disabled={(date) => date < minPickupDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Pickup Time Slot *</Label>
                <Select value={pickupSlotId} onValueChange={setPickupSlotId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.name} ({slot.start_time} - {slot.end_time})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Pickup Address *</Label>
                <Select value={pickupAddressId} onValueChange={setPickupAddressId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select address" />
                  </SelectTrigger>
                  <SelectContent>
                    {addresses.map((addr) => (
                      <SelectItem key={addr.id} value={addr.id}>
                        {addr.label} - {addr.address_line1}, {addr.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {addresses.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No addresses found. Please add an address first.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
