import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  defaultOrderNotificationSettings,
  MODE_LABELS,
  ORDER_NOTIFICATIONS_KEY,
  serializeOrderNotificationSettings,
  type NotificationMode,
  type OrderNotificationSettings,
} from "@/lib/orderNotifications";
import { useOrderNotificationSettings } from "@/hooks/useOrderNotificationSettings";

/**
 * Super-admin card for order SMS/WhatsApp notifications. Saved on its own
 * (not by "Save All"). Off by default. Real sending also needs the server
 * secret ORDER_NOTIFICATIONS_LIVE, so choosing Live here alone sends nothing.
 */
export function OrderNotificationSettingsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OrderNotificationSettings>(defaultOrderNotificationSettings);
  const [confirmLive, setConfirmLive] = useState(false);

  const { data: saved, isLoading } = useOrderNotificationSettings();

  useEffect(() => { if (saved) setForm(saved); }, [saved]);

  const save = useMutation({
    mutationFn: async (next: OrderNotificationSettings) => {
      const value = serializeOrderNotificationSettings(next) as unknown as Json;
      const description = "Order SMS/WhatsApp notifications (off | record_only | live)";
      const { data: existing } = await supabase
        .from("platform_settings").select("id").eq("key", ORDER_NOTIFICATIONS_KEY).maybeSingle();
      const { error } = existing
        ? await supabase.from("platform_settings").update({ value, description }).eq("key", ORDER_NOTIFICATIONS_KEY)
        : await supabase.from("platform_settings").insert({ key: ORDER_NOTIFICATIONS_KEY, value, description });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast.success("Order notification settings saved");
    },
    onError: (e: Error) => toast.error("Failed to save: " + e.message),
  });

  const onSave = () => {
    if (form.mode === "live" && saved?.mode !== "live") setConfirmLive(true);
    else save.mutate(form);
  };

  const setSms = (patch: Partial<OrderNotificationSettings["sms"]>) => setForm((f) => ({ ...f, sms: { ...f.sms, ...patch } }));
  const setWa = (patch: Partial<OrderNotificationSettings["whatsapp"]>) => setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, ...patch } }));

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order SMS & WhatsApp</CardTitle>
        <CardDescription>
          Order confirmation after payment and a dispatch message from Admin → Orders → Dispatch.
          Sent by the server, so they don't depend on the customer's app staying open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="notif-mode">Mode</Label>
          <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v as NotificationMode }))}>
            <SelectTrigger id="notif-mode" className="sm:w-80"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as NotificationMode[]).map((m) => (
                <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {form.mode === "off" && "Nothing is queued or sent. Dispatch details can still be saved."}
            {form.mode === "record_only" && "Messages are recorded in each order's history (“Queued”, then “Not sent” once the scheduled sender runs). No SMS or WhatsApp is sent."}
            {form.mode === "live" && "Messages are sent on the channels switched on below, once live sending is also activated on the server."}
          </p>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-sms">SMS (MSG91)</Label>
              <p className="text-sm text-muted-foreground">Needs DLT-approved templates set up as MSG91 flows.</p>
            </div>
            <Switch id="notif-sms" checked={form.sms.enabled} onCheckedChange={(c) => setSms({ enabled: c })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="notif-sms-confirm">Confirmation flow/template ID</Label>
              <Input id="notif-sms-confirm" value={form.sms.confirmation_flow_id} onChange={(e) => setSms({ confirmation_flow_id: e.target.value })} />
              <p className="text-xs text-muted-foreground">##VAR1## order number, ##VAR2## amount</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notif-sms-dispatch">Dispatch flow/template ID</Label>
              <Input id="notif-sms-dispatch" value={form.sms.dispatch_flow_id} onChange={(e) => setSms({ dispatch_flow_id: e.target.value })} />
              <p className="text-xs text-muted-foreground">##VAR1## order, ##VAR2## partner, ##VAR3## person, ##VAR4## contact</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-wa">WhatsApp (MSG91)</Label>
              <p className="text-sm text-muted-foreground">Needs a WhatsApp Business number on MSG91 and Meta-approved utility templates.</p>
            </div>
            <Switch id="notif-wa" checked={form.whatsapp.enabled} onCheckedChange={(c) => setWa({ enabled: c })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="notif-wa-number">Integrated WhatsApp number</Label>
              <Input id="notif-wa-number" inputMode="tel" value={form.whatsapp.integrated_number} onChange={(e) => setWa({ integrated_number: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notif-wa-lang">Template language code</Label>
              <Input id="notif-wa-lang" value={form.whatsapp.language} onChange={(e) => setWa({ language: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notif-wa-confirm">Confirmation template name</Label>
              <Input id="notif-wa-confirm" value={form.whatsapp.confirmation_template} onChange={(e) => setWa({ confirmation_template: e.target.value })} />
              <p className="text-xs text-muted-foreground">{"{{1}}"} order number, {"{{2}}"} amount</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notif-wa-dispatch">Dispatch template name</Label>
              <Input id="notif-wa-dispatch" value={form.whatsapp.dispatch_template} onChange={(e) => setWa({ dispatch_template: e.target.value })} />
              <p className="text-xs text-muted-foreground">{"{{1}}"} order, {"{{2}}"} partner, {"{{3}}"} person, {"{{4}}"} contact</p>
            </div>
          </div>
        </div>

        <Button className="w-full sm:w-auto" onClick={onSave} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save notification settings
        </Button>
      </CardContent>

      <AlertDialog open={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Live?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers will get real SMS/WhatsApp messages (charged by MSG91) for new paid orders and dispatches,
              on the channels switched on here, once live sending is activated on the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate(form)}>Switch to Live</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
