import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, MessageSquare, RotateCcw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  canDispatch,
  EVENT_LABELS,
  normalizeIndianMobile,
  PARTNER_OPTIONS,
  partnerLabel,
  STATUS_LABELS,
  type PartnerType,
} from "@/lib/orderNotifications";
import { useOrderNotificationSettings } from "@/hooks/useOrderNotificationSettings";

interface OrderLike {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
}

const statusTone: Record<string, string> = {
  sent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  unknown: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  queued: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  sending: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  skipped: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const toLocalInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

/**
 * Admin Order Details: dispatch record + Dispatch dialog + notification
 * history and Resend. All writes go through admin RPCs that re-check
 * everything server-side.
 */
export function OrderDispatchPanel({ order }: { order: OrderLike }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: settings } = useOrderNotificationSettings();
  const mode = settings?.mode ?? "off";

  // Until the migration is applied these tables don't exist: show nothing
  // broken, just treat it as "no dispatch / no history".
  const { data: dispatch } = useQuery({
    queryKey: ["order-dispatch", order.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_dispatches").select("*").eq("order_id", order.id).maybeSingle();
      if (error) return null;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["order-notifications", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_notifications")
        .select("id, event, channel, seq, status, attempts, phone_last4, last_error, created_at, sent_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((n) => n.status === "queued" || n.status === "sending") ? 15000 : false,
  });

  const resend = useMutation({
    mutationFn: async (event: "order_confirmed" | "order_dispatched") => {
      const { data, error } = await supabase.rpc("admin_resend_order_notification", { p_order_id: order.id, p_event: event });
      if (error) throw error;
      return data as { notifications_queued?: number } | null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["order-notifications", order.id] });
      toast.success(data?.notifications_queued ? "Message queued" : "A message is already waiting to be sent, or no channel is switched on");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispatchable = canDispatch(order);
  const notificationsOn = mode !== "off";

  return (
    <div className="space-y-4 rounded-lg border p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="flex items-center gap-2 font-medium">
          <Truck className="h-4 w-4" /> Dispatch
        </h4>
        {dispatchable && (
          <Button size="sm" variant={dispatch ? "outline" : "default"} className="w-full sm:w-auto" onClick={() => setOpen(true)}>
            {dispatch ? "Edit dispatch details" : "Dispatch order"}
          </Button>
        )}
      </div>

      {dispatch ? (
        <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Partner:</span> {partnerLabel(dispatch.partner_type, dispatch.partner_name)}</p>
          <p><span className="text-muted-foreground">Dispatched:</span> {format(new Date(dispatch.dispatched_at), "MMM d, h:mm a")}</p>
          <p><span className="text-muted-foreground">Delivery person:</span> {dispatch.rider_name || "—"}</p>
          <p><span className="text-muted-foreground">Contact:</span> {dispatch.rider_phone}</p>
          {dispatch.notes && <p className="sm:col-span-2"><span className="text-muted-foreground">Notes:</span> {dispatch.notes}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {dispatchable ? "Not dispatched yet." : "Only paid orders that aren't cancelled or returned can be dispatched."}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4" /> Customer messages
          </h4>
          {notificationsOn && order.payment_status === "completed" && !["cancelled", "returned"].includes(order.status) && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate("order_confirmed")}>
                <RotateCcw className="mr-1 h-3 w-3" /> Resend confirmation
              </Button>
              {dispatch && (
                <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate("order_dispatched")}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Resend dispatch
                </Button>
              )}
            </div>
          )}
        </div>
        {!notificationsOn && (
          <p className="text-xs text-muted-foreground">Order SMS/WhatsApp notifications are switched off. Nothing is sent to customers.</p>
        )}
        {notificationsOn && mode === "record_only" && (
          <p className="text-xs text-muted-foreground">Test mode: messages are recorded here but not sent.</p>
        )}
        {history.length > 0 ? (
          <ul className="space-y-2">
            {history.map((n) => (
              <li key={n.id} className="rounded-md bg-muted/40 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{EVENT_LABELS[n.event] ?? n.event}{n.seq > 1 ? ` (resend ${n.seq - 1})` : ""}</span>
                  <span className="uppercase text-muted-foreground">{n.channel}</span>
                  <Badge variant="secondary" className={statusTone[n.status] ?? ""}>{STATUS_LABELS[n.status] ?? n.status}</Badge>
                  {n.phone_last4 && <span className="text-muted-foreground">to ••••{n.phone_last4}</span>}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {format(new Date(n.sent_at ?? n.created_at), "MMM d, h:mm a")}
                  {n.attempts > 1 ? ` · ${n.attempts} attempts` : ""}
                </p>
                {n.last_error && <p className="mt-1 break-words text-muted-foreground">{n.last_error}</p>}
              </li>
            ))}
          </ul>
        ) : (
          notificationsOn && <p className="text-xs text-muted-foreground">No messages for this order yet.</p>
        )}
      </div>

      {open && (
        <DispatchDialog
          order={order}
          existing={dispatch ?? null}
          notificationsOn={notificationsOn}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            queryClient.invalidateQueries({ queryKey: ["order-dispatch", order.id] });
            queryClient.invalidateQueries({ queryKey: ["order-notifications", order.id] });
            queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
          }}
        />
      )}
    </div>
  );
}

interface DispatchRecord {
  partner_type: string;
  partner_name: string | null;
  rider_name: string | null;
  rider_phone: string;
  dispatched_at: string;
  notes: string | null;
}

function DispatchDialog({
  order, existing, notificationsOn, onClose, onSaved,
}: {
  order: OrderLike;
  existing: DispatchRecord | null;
  notificationsOn: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [partnerType, setPartnerType] = useState<PartnerType | "">((existing?.partner_type as PartnerType) ?? "");
  const [partnerName, setPartnerName] = useState(existing?.partner_name ?? "");
  const [riderName, setRiderName] = useState(existing?.rider_name ?? "");
  const [riderPhone, setRiderPhone] = useState(existing?.rider_phone ?? "");
  const [dispatchedAt, setDispatchedAt] = useState(toLocalInput(existing?.dispatched_at ?? new Date().toISOString()));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [notify, setNotify] = useState(true);
  const [prefilling, setPrefilling] = useState(false);

  // In-house: prefill from the driver assigned on the Assignments page (still editable).
  const choosePartner = async (value: PartnerType) => {
    setPartnerType(value);
    if (value !== "in_house" || riderName || riderPhone) return;
    setPrefilling(true);
    try {
      const { data: assignment } = await supabase
        .from("order_assignments")
        .select("delivery_partner_id")
        .eq("order_id", order.id)
        .maybeSingle();
      if (!assignment?.delivery_partner_id) return;
      const { data: partner } = await supabase
        .from("delivery_partners")
        .select("user_id")
        .eq("id", assignment.delivery_partner_id)
        .maybeSingle();
      if (!partner?.user_id) return;
      const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", partner.user_id).maybeSingle();
      if (profile?.full_name) setRiderName(profile.full_name);
      const phone = normalizeIndianMobile(profile?.phone);
      if (phone) setRiderPhone(phone);
    } finally {
      setPrefilling(false);
    }
  };

  const phone = normalizeIndianMobile(riderPhone);
  const errors = {
    partner: !partnerType ? "Choose a delivery partner" : "",
    partnerName: partnerType === "other" && !partnerName.trim() ? "Enter the partner name" : "",
    phone: !phone ? "Enter a valid 10-digit mobile number" : "",
  };
  const valid = !errors.partner && !errors.partnerName && !errors.phone;
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_dispatch_order", {
        p_order_id: order.id,
        p_partner_type: partnerType as string,
        p_partner_name: partnerType === "other" ? partnerName.trim() : null,
        p_rider_name: riderName.trim() || null,
        p_rider_phone: phone as string,
        p_dispatched_at: dispatchedAt ? new Date(dispatchedAt).toISOString() : null,
        p_notes: notes.trim() || null,
        p_notify: notify,
      });
      if (error) throw error;
      return data as { first_dispatch?: boolean; status_changed?: boolean; notifications_queued?: number } | null;
    },
    onSuccess: (r) => {
      const parts = [existing ? "Dispatch details updated" : "Order dispatched"];
      if (r?.status_changed) parts.push("status set to Shipped");
      if (r?.notifications_queued) parts.push("customer message queued");
      else if (!existing && !notificationsOn) parts.push("notifications are off, details saved only");
      toast.success(parts.join(" · "));
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit dispatch" : "Dispatch order"} {order.order_number}</DialogTitle>
          <DialogDescription>
            {existing
              ? "Saving changes doesn't send a new message. Use Resend dispatch for that."
              : "The order moves to Shipped if it hasn't progressed further."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid) save.mutate(); }}
        >
          <div className="space-y-1">
            <Label htmlFor="dispatch-partner">Delivery partner</Label>
            <Select value={partnerType} onValueChange={(v) => choosePartner(v as PartnerType)}>
              <SelectTrigger id="dispatch-partner"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                {PARTNER_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {touched && errors.partner && <p className="text-xs text-destructive">{errors.partner}</p>}
          </div>

          {partnerType === "other" && (
            <div className="space-y-1">
              <Label htmlFor="dispatch-partner-name">Partner name</Label>
              <Input id="dispatch-partner-name" maxLength={60} value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
              {touched && errors.partnerName && <p className="text-xs text-destructive">{errors.partnerName}</p>}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="dispatch-rider-name">Delivery person's name (optional)</Label>
            <Input id="dispatch-rider-name" maxLength={60} value={riderName} onChange={(e) => setRiderName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="dispatch-rider-phone">Delivery contact number</Label>
            <Input
              id="dispatch-rider-phone"
              type="tel"
              inputMode="tel"
              maxLength={16}
              placeholder="10-digit mobile"
              value={riderPhone}
              onChange={(e) => setRiderPhone(e.target.value)}
            />
            {prefilling && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Filling in the assigned driver…</p>}
            {touched && errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="dispatch-time">Dispatch time</Label>
            <Input id="dispatch-time" type="datetime-local" value={dispatchedAt} onChange={(e) => setDispatchedAt(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="dispatch-notes">Internal notes (never sent)</Label>
            <Textarea id="dispatch-notes" maxLength={500} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {!existing && (
            <div className="flex items-start gap-2">
              <Checkbox id="dispatch-notify" checked={notify} onCheckedChange={(c) => setNotify(c === true)} />
              <div className="space-y-0.5">
                <Label htmlFor="dispatch-notify">Notify the customer</Label>
                {!notificationsOn && <p className="text-xs text-muted-foreground">Notifications are off: details are saved only.</p>}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existing ? "Save changes" : "Dispatch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
