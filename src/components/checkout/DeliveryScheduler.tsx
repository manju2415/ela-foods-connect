import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { availableDeliveryDates, isDeliverableOn, loadDeliveryRules, type DeliveryRules } from "@/lib/deliveryDays";

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
  // Products in the cart; their categories decide which dates are offered.
  productIds?: string[];
  // Reports whether at least one delivery date is available.
  onAvailabilityChange?: (available: boolean) => void;
}

// Standard delivery: orders placed before noon can come the same evening;
// later orders go out the next delivery day, morning or afternoon.
const SAME_DAY_CUTOFF_HOUR = 12;

type SlotKind = "morning" | "afternoon" | "evening";
const SLOT_KINDS: Record<SlotKind, { start: string; name: string; hours: string; order: number }> = {
  morning: { start: "09:00", name: "Morning", hours: "9 AM – 12 PM", order: 0 },
  afternoon: { start: "12:00", name: "Afternoon", hours: "12 PM – 3 PM", order: 1 },
  evening: { start: "15:00", name: "Evening", hours: "3 PM – 6 PM", order: 2 },
};

interface DeliveryOption {
  key: string;
  date: Date;
  slot: DeliverySlot | null;
  label: string;
}

const dayLabel = (date: Date) =>
  isToday(date) ? "Today" : isTomorrow(date) ? "Tomorrow" : format(date, "EEEE, d MMM");

export const DeliveryScheduler = ({
  selectedDate,
  selectedSlotId,
  onDateChange,
  onSlotChange,
  productIds = [],
  onAvailabilityChange,
}: DeliverySchedulerProps) => {
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<DeliveryRules | null>(null);
  // Re-evaluated every minute so the same-day option disappears at noon.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const productKey = [...productIds].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    loadDeliveryRules(productKey ? productKey.split(",") : []).then((loaded) => {
      if (!cancelled) setRules(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [productKey]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("delivery_time_slots")
      .select("id, name, start_time, end_time")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setSlots(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The admin-managed slot rows, matched by start time (falling back to order).
  const slotFor = (kind: SlotKind): DeliverySlot | null =>
    slots.find((s) => s.start_time.startsWith(SLOT_KINDS[kind].start)) ?? slots[SLOT_KINDS[kind].order] ?? null;

  const options = useMemo<DeliveryOption[]>(() => {
    if (!rules) return [];
    const ids = rules.categoryIds.length > 0 ? Array.from(new Set(rules.categoryIds)) : [null];
    const nextDay = availableDeliveryDates(rules.categoryIds, rules.categories, rules.overrides)[0];
    if (!nextDay) return [];

    const option = (date: Date, kind: SlotKind): DeliveryOption => {
      const slot = slotFor(kind);
      return {
        key: `${format(date, "yyyy-MM-dd")}|${kind}`,
        date,
        slot,
        label: `${dayLabel(date)}, ${SLOT_KINDS[kind].name} (${SLOT_KINDS[kind].hours})`,
      };
    };

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sameDay =
      now.getHours() < SAME_DAY_CUTOFF_HOUR &&
      ids.every((id) => isDeliverableOn(today, id, rules.categories, rules.overrides));

    return sameDay
      ? [option(today, "evening"), option(nextDay, "morning")]
      : [option(nextDay, "morning"), option(nextDay, "afternoon")];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, slots, now]);

  const selectedKey =
    options.find(
      (o) => selectedDate && o.date.toDateString() === selectedDate.toDateString() && (o.slot?.id ?? null) === selectedSlotId,
    )?.key ?? "";

  const choose = (o: DeliveryOption) => {
    onDateChange(o.date);
    if (o.slot) onSlotChange(o.slot.id);
  };

  // Pick the first option, and replace a selection that is no longer offered
  // (e.g. noon passed or the cart changed).
  useEffect(() => {
    if (loading || options.length === 0 || selectedKey) return;
    choose(options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, options, selectedKey]);

  useEffect(() => {
    if (rules) onAvailabilityChange?.(options.length > 0);
  }, [rules, options, onAvailabilityChange]);

  if (loading || !rules) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Standard Delivery
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
          <Truck className="h-5 w-5" />
          Standard Delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Order before 12 PM for delivery the same evening. Orders after 12 PM are delivered the next day.
        </p>
        {rules.restrictedLabels.length > 0 && (
          <p className="text-xs text-muted-foreground">Delivery days: {rules.restrictedLabels.join(" · ")}</p>
        )}
        {options.length === 0 ? (
          <p className="text-sm text-destructive">
            No delivery date is available for all the items in your cart. Please order them separately or try again later.
          </p>
        ) : (
          <RadioGroup
            value={selectedKey}
            onValueChange={(key) => {
              const o = options.find((opt) => opt.key === key);
              if (o) choose(o);
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {options.map((o) => (
              <label
                key={o.key}
                htmlFor={o.key}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedKey === o.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={o.key} id={o.key} />
                <span className="font-medium text-sm">{o.label}</span>
              </label>
            ))}
          </RadioGroup>
        )}
      </CardContent>
    </Card>
  );
};
