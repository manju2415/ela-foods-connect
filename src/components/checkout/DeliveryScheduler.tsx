import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addDays, isBefore, startOfToday } from "date-fns";

interface DeliverySlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface DeliverySchedulerProps {
  selectedDate: Date | null;
  selectedSlotId: string | null;
  onDateChange: (date: Date) => void;
  onSlotChange: (slotId: string) => void;
}

export const DeliveryScheduler = ({
  selectedDate,
  selectedSlotId,
  onDateChange,
  onSlotChange,
}: DeliverySchedulerProps) => {
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate next 7 available days
  const availableDates = Array.from({ length: 7 }, (_, i) => addDays(startOfToday(), i + 1));

  useEffect(() => {
    fetchSlots();
  }, []);

  const fetchSlots = async () => {
    const { data, error } = await supabase
      .from("delivery_time_slots")
      .select("id, name, start_time, end_time")
      .eq("is_active", true)
      .order("display_order");

    if (!error && data) {
      setSlots(data);
      if (data.length > 0 && !selectedSlotId) {
        onSlotChange(data[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!selectedDate && availableDates.length > 0) {
      onDateChange(availableDates[0]);
    }
  }, [selectedDate, availableDates, onDateChange]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Delivery Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Schedule Delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Select Delivery Date</Label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {availableDates.map((date) => (
              <Button
                key={date.toISOString()}
                variant={selectedDate?.toDateString() === date.toDateString() ? "default" : "outline"}
                className="flex flex-col h-auto py-2 px-1"
                onClick={() => onDateChange(date)}
              >
                <span className="text-xs">{format(date, "EEE")}</span>
                <span className="text-lg font-bold">{format(date, "d")}</span>
                <span className="text-xs">{format(date, "MMM")}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Time Slot Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Select Time Slot
          </Label>
          <RadioGroup value={selectedSlotId || ""} onValueChange={onSlotChange}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    selectedSlotId === slot.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => onSlotChange(slot.id)}
                >
                  <RadioGroupItem value={slot.id} id={slot.id} />
                  <label htmlFor={slot.id} className="flex-1 cursor-pointer">
                    <span className="font-medium">{slot.name}</span>
                  </label>
                </div>
              ))}
            </div>
          </RadioGroup>
        </div>

        {selectedDate && selectedSlotId && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm">
              <span className="font-medium">Scheduled for:</span>{" "}
              {format(selectedDate, "EEEE, MMMM d, yyyy")} - {slots.find(s => s.id === selectedSlotId)?.name}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
