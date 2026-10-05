import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfToday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { untypedSupabase } from "@/lib/untypedSupabase";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAY_LABELS } from "@/lib/deliveryDays";

// Admin and super admin (AdminLayout requires is_admin; the table's RLS
// allows writes only for is_admin).

interface Override {
  id: string;
  override_date: string;
  category_id: string | null;
  is_available: boolean;
  reason: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
  delivery_weekdays: number[] | null;
}

const STORE_WIDE = "all";

export default function DeliveryCalendar() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [scope, setScope] = useState<string>(STORE_WIDE);
  const [availability, setAvailability] = useState<"closed" | "open">("closed");
  const [reason, setReason] = useState("");

  const today = format(startOfToday(), "yyyy-MM-dd");

  const { data: categories = [] } = useQuery({
    queryKey: ["delivery-calendar-categories"],
    queryFn: async () => {
      const { data, error } = await untypedSupabase
        .from("categories")
        .select("id, name, parent_id, delivery_weekdays")
        .order("name");
      if (error) throw error;
      return data as CategoryOption[];
    },
  });

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["delivery-date-overrides"],
    queryFn: async () => {
      const { data, error } = await untypedSupabase
        .from("delivery_date_overrides")
        .select("id, override_date, category_id, is_available, reason")
        .gte("override_date", today)
        .order("override_date");
      if (error) throw error;
      return data as Override[];
    },
  });

  const categoryName = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? "Deleted category" : "All products";

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await untypedSupabase.from("delivery_date_overrides").insert({
        override_date: date,
        category_id: scope === STORE_WIDE ? null : scope,
        is_available: availability === "open",
        reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-date-overrides"] });
      toast.success("Delivery calendar updated");
      setDate("");
      setReason("");
    },
    onError: (error: Error) => {
      toast.error(
        error.message.includes("duplicate")
          ? "There is already an entry for this date and category. Remove it first."
          : "Failed to save: " + error.message,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedSupabase.from("delivery_date_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-date-overrides"] });
      toast.success("Entry removed");
    },
    onError: (error: Error) => toast.error("Failed to remove: " + error.message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast.error("Choose a date");
      return;
    }
    if (date < today) {
      toast.error("Choose today or a future date");
      return;
    }
    addMutation.mutate();
  };

  const restrictedCategories = categories.filter((c) => c.delivery_weekdays && c.delivery_weekdays.length > 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Delivery Calendar</h1>
          <p className="text-muted-foreground">
            Close delivery on holidays, or open an extra delivery date. Checkout only offers dates that are open for every item in the cart.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Add a date
            </CardTitle>
            <CardDescription>
              Example: Fish is delivered on Sundays only. If a Sunday is a holiday, close that Sunday for Fish and open the Monday instead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="override-date">Date</Label>
                <Input id="override-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
                {date && <p className="text-xs text-muted-foreground">{format(parseISO(date), "EEEE")}</p>}
              </div>
              <div className="space-y-2">
                <Label>Applies to</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STORE_WIDE}>All products (whole store)</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delivery on this date</Label>
                <Select value={availability} onValueChange={(v) => setAvailability(v as "closed" | "open")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">Closed (no delivery)</SelectItem>
                    <SelectItem value="open">Open (extra delivery date)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-reason">Reason (optional)</Label>
                <Input
                  id="override-reason"
                  placeholder="e.g. Onam holiday"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming changes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming holidays or extra delivery dates.</p>
            ) : (
              <div className="divide-y">
                {overrides.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{format(parseISO(o.override_date), "EEE, d MMM yyyy")}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {categoryName(o.category_id)}
                        {o.reason ? ` · ${o.reason}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={o.is_available ? "default" : "destructive"}>
                        {o.is_available ? "Open" : "Closed"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(o.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly delivery days</CardTitle>
            <CardDescription>Set these per category in Categories → Edit → Delivery Days.</CardDescription>
          </CardHeader>
          <CardContent>
            {restrictedCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">All categories are delivered every day.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {restrictedCategories.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.name}:</span>{" "}
                    {[...(c.delivery_weekdays ?? [])].sort().map((d) => WEEKDAY_LABELS[d]).join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
