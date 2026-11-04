import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Gift, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { OfferDialog, type CatalogProduct, type CatalogVariant } from "@/components/admin/offers/OfferDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUDIENCE_LABELS,
  emptyOfferForm,
  formatIst,
  isoToIstInput,
  KIND_CONFIG,
  limitsSummary,
  OFFER_KINDS,
  offerStatus,
  STATUS_LABELS,
  toSavePayload,
  type OfferForm,
  type OfferItemRow,
  type OfferKind,
  type OfferRow,
  type OfferStatus,
} from "@/lib/offers";

const OFFERS_KEY = ["admin-offers"] as const;
const PAGE = 1000;

const statusTone: Record<OfferStatus, string> = {
  live: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ended: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  off: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

/** Database messages -> plain words for the admin. */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("offers_window_valid")) return "The end must be after the start.";
  if (m.includes("offers_end_required")) return "Choose when the offer ends.";
  if (m.includes("offers_min_cart_value")) return "Enter the minimum cart amount.";
  if (m.includes("offer_price_check")) return "Each offer price must be above ₹0.";
  if (m.includes("offer_items_once")) return "The same product is listed twice.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "Only a super admin can manage offers.";
  return message;
}

// The shop can have more rows than one API page returns.
async function fetchAll<T>(table: "products" | "product_variants", columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export default function Offers() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<OfferKind>("cart_unlock");
  const [editing, setEditing] = useState<OfferForm | null>(null);
  const [deleting, setDeleting] = useState<OfferRow | null>(null);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: OFFERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("offers").select("*").order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: [...OFFERS_KEY, "items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_items").select("*").order("display_order");
      if (error) throw error;
      return (data ?? []) as OfferItemRow[];
    },
  });

  const { data: catalog } = useQuery({
    queryKey: [...OFFERS_KEY, "catalog"],
    queryFn: async () => {
      const [products, variants] = await Promise.all([
        fetchAll<CatalogProduct>("products", "id, name, price, member_price, is_active"),
        fetchAll<CatalogVariant>("product_variants", "id, product_id, label, price, member_price, is_active"),
      ]);
      return { products: products.sort((a, b) => a.name.localeCompare(b.name)), variants };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: masterOn = false } = useQuery({
    queryKey: ["platform-settings", "offers_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "offers_settings").maybeSingle();
      return (data?.value as { enabled?: boolean } | null)?.enabled === true;
    },
  });

  const productsById = useMemo(() => new Map((catalog?.products ?? []).map((p) => [p.id, p])), [catalog]);
  const variantsById = useMemo(() => new Map((catalog?.variants ?? []).map((v) => [v.id, v])), [catalog]);
  const variantsByProduct = useMemo(() => {
    const m = new Map<string, CatalogVariant[]>();
    for (const v of catalog?.variants ?? []) m.set(v.product_id, [...(m.get(v.product_id) ?? []), v]);
    return m;
  }, [catalog]);
  const itemsByOffer = useMemo(() => {
    const m = new Map<string, OfferItemRow[]>();
    for (const it of items) m.set(it.offer_id, [...(m.get(it.offer_id) ?? []), it]);
    return m;
  }, [items]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: OFFERS_KEY });

  const save = useMutation({
    mutationFn: async (form: OfferForm) => {
      const { p_offer, p_items } = toSavePayload(form);
      const { error } = await supabase.rpc("admin_save_offer", { p_offer, p_items });
      if (error) throw error;
    },
    onSuccess: (_d, form) => {
      toast.success(form.id ? "Offer updated" : "Offer created");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(friendlyError(e.message)),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("admin_set_offer_active", { p_offer_id: id, p_active: active });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.active ? "Offer switched on" : "Offer switched off"); refresh(); },
    onError: (e: Error) => toast.error(friendlyError(e.message)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offer deleted"); setDeleting(null); refresh(); },
    onError: (e: Error) => toast.error(friendlyError(e.message)),
  });

  const openEdit = (o: OfferRow) => {
    const formItems = (itemsByOffer.get(o.id) ?? []).flatMap((it) => {
      const p = productsById.get(it.product_id);
      if (!p) return [];
      const v = it.variant_id ? variantsById.get(it.variant_id) : undefined;
      return [{
        product_id: it.product_id,
        variant_id: it.variant_id,
        name: p.name,
        variant_label: v?.label ?? null,
        price: Number(v ? v.price : p.price),
        member_price: v ? v.member_price : p.member_price,
        offer_price: String(it.offer_price),
        product_active: p.is_active && (v ? v.is_active : true),
      }];
    });
    setEditing({
      id: o.id,
      kind: o.kind,
      name: o.name,
      description: o.description ?? "",
      starts_at: isoToIstInput(o.starts_at),
      ends_at: o.ends_at ? isoToIstInput(o.ends_at) : "",
      is_active: o.is_active,
      min_cart_value: o.min_cart_value != null ? String(o.min_cart_value) : "",
      max_units_per_order: String(o.max_units_per_order),
      max_units_per_customer: o.max_units_per_customer != null ? String(o.max_units_per_customer) : "",
      customer_limit_period: o.customer_limit_period,
      total_units_cap: o.total_units_cap != null ? String(o.total_units_cap) : "",
      audience: o.audience,
      items: formItems,
    });
  };

  const now = new Date();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Gift className="h-6 w-6" /> Offers & Promotions
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">Set up ₹9 offers, festival prices and daily deals.</p>
        </div>

        {!masterOn && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Customers don't see offers yet. You can prepare and schedule them now. They will start showing once
              checkout support for offers is released and switched on.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as OfferKind)}>
          <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto">
            {OFFER_KINDS.map((k) => (
              <TabsTrigger key={k} value={k} className="text-xs sm:text-sm">{KIND_CONFIG[k].tab}</TabsTrigger>
            ))}
          </TabsList>

          {OFFER_KINDS.map((k) => {
            const list = offers.filter((o) => o.kind === k);
            return (
              <TabsContent key={k} value={k} className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">{KIND_CONFIG[k].help}</p>
                  <Button className="w-full shrink-0 sm:w-auto" onClick={() => setEditing(emptyOfferForm(k))} disabled={!catalog}>
                    <Plus className="mr-2 h-4 w-4" /> {KIND_CONFIG[k].newLabel}
                  </Button>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>
                ) : list.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No offers here yet.</CardContent></Card>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {list.map((o) => {
                      const status = offerStatus(o, now);
                      const its = itemsByOffer.get(o.id) ?? [];
                      const names = its.slice(0, 3).map((it) => {
                        const p = productsById.get(it.product_id);
                        const v = it.variant_id ? variantsById.get(it.variant_id) : undefined;
                        return `${p?.name ?? "Product"}${v ? ` (${v.label})` : ""} ₹${it.offer_price}`;
                      });
                      return (
                        <Card key={o.id}>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words font-semibold">{o.name}</p>
                                <Badge variant="secondary" className={`mt-1 ${statusTone[status]}`}>{STATUS_LABELS[status]}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{o.is_active ? "On" : "Off"}</span>
                                <Switch
                                  aria-label={`Switch ${o.name} ${o.is_active ? "off" : "on"}`}
                                  checked={o.is_active}
                                  disabled={toggle.isPending}
                                  onCheckedChange={(c) => toggle.mutate({ id: o.id, active: c })}
                                />
                              </div>
                            </div>
                            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                              <span>{formatIst(o.starts_at)} → {o.ends_at ? formatIst(o.ends_at) : "no end date"}</span>
                            </p>
                            <div className="space-y-1 text-sm">
                              {o.min_cart_value != null && <p>Cart of ₹{Number(o.min_cart_value).toLocaleString("en-IN")} or more</p>}
                              <p>{limitsSummary(o)}{o.audience !== "all" ? ` · ${AUDIENCE_LABELS[o.audience]}` : ""}</p>
                              <p className="text-muted-foreground">
                                {its.length === 0 ? "No products yet" : `${its.length} product${its.length > 1 ? "s" : ""}: ${names.join(", ")}${its.length > 3 ? ", …" : ""}`}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => openEdit(o)} disabled={!catalog}>
                                <Pencil className="mr-1 h-3 w-3" /> Edit
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(o)}>
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {editing && catalog && (
        <OfferDialog
          key={editing.id ?? `new-${editing.kind}`}
          initial={editing}
          products={catalog.products}
          variantsByProduct={variantsByProduct}
          saving={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(f) => save.mutate(f)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The offer and its product list are removed. To pause an offer instead, switch it off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
