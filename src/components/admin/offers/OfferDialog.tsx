import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AUDIENCE_LABELS,
  KIND_CONFIG,
  percentOff,
  priceWarning,
  validateOfferForm,
  type LimitPeriod,
  type OfferAudience,
  type OfferForm,
  type OfferFormItem,
} from "@/lib/offers";

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  member_price: number | null;
  is_active: boolean;
}

export interface CatalogVariant {
  id: string;
  product_id: string;
  label: string;
  price: number;
  member_price: number | null;
  is_active: boolean;
}

const rupees = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

/** Search the catalog and add a product, or one of its options. */
function ProductPicker({
  products,
  variantsByProduct,
  chosen,
  onAdd,
}: {
  products: CatalogProduct[];
  variantsByProduct: Map<string, CatalogVariant[]>;
  chosen: Set<string>;
  onAdd: (item: OfferFormItem) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return products.filter((p) => p.is_active && p.name.toLowerCase().includes(q)).slice(0, 15);
  }, [products, query]);

  const key = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ""}`;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search products to add (type 2+ letters)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
          {results.length === 0 && <p className="p-2 text-sm text-muted-foreground">No matching products in the shop.</p>}
          {results.map((p) => {
            const variants = (variantsByProduct.get(p.id) ?? []).filter((v) => v.is_active);
            if (variants.length === 0) {
              const added = chosen.has(key(p.id, null));
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                  <span className="min-w-0 truncate text-sm">{p.name} <span className="text-muted-foreground">· {rupees(p.price)}</span></span>
                  <Button
                    type="button" size="sm" variant="outline" disabled={added}
                    onClick={() => onAdd({ product_id: p.id, variant_id: null, name: p.name, variant_label: null, price: p.price, member_price: p.member_price, offer_price: "", product_active: true })}
                  >
                    {added ? "Added" : <><Plus className="mr-1 h-3 w-3" />Add</>}
                  </Button>
                </div>
              );
            }
            return (
              <div key={p.id} className="rounded px-2 py-1.5">
                <p className="text-sm">{p.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {variants.map((v) => {
                    const added = chosen.has(key(p.id, v.id));
                    return (
                      <Button
                        key={v.id} type="button" size="sm" variant="outline" disabled={added}
                        onClick={() => onAdd({ product_id: p.id, variant_id: v.id, name: p.name, variant_label: v.label, price: v.price, member_price: v.member_price, offer_price: "", product_active: true })}
                      >
                        {added ? `${v.label} added` : <><Plus className="mr-1 h-3 w-3" />{v.label} · {rupees(v.price)}</>}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OfferDialog({
  initial,
  products,
  variantsByProduct,
  saving,
  onCancel,
  onSave,
}: {
  initial: OfferForm;
  products: CatalogProduct[];
  variantsByProduct: Map<string, CatalogVariant[]>;
  saving: boolean;
  onCancel: () => void;
  onSave: (form: OfferForm) => void;
}) {
  const [form, setForm] = useState<OfferForm>(initial);
  const [touched, setTouched] = useState(false);
  const cfg = KIND_CONFIG[form.kind];
  const errors = validateOfferForm(form);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const chosen = useMemo(() => new Set(form.items.map((i) => `${i.product_id}:${i.variant_id ?? ""}`)), [form.items]);

  const set = <K extends keyof OfferForm>(k: K, v: OfferForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setItemPrice = (i: number, v: string) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, offer_price: v } : it)) }));
  const removeItem = (i: number) => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }));
  const addItem = (item: OfferFormItem) =>
    setForm((f) => ({ ...f, items: [...f.items, { ...item, offer_price: f.kind === "cart_unlock" ? "9" : "" }] }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length === 0) onSave(form);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onCancel(); }}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? `Edit ${cfg.title.replace(/s$/, "").toLowerCase()}` : cfg.newLabel}</DialogTitle>
          <DialogDescription>{cfg.help}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit} noValidate>
          <div className="space-y-1">
            <Label htmlFor="offer-name">Offer name (customers see this)</Label>
            <Input id="offer-name" maxLength={80} value={form.name} placeholder={form.kind === "festival" ? "e.g. Diwali Specials" : form.kind === "deal_of_day" ? "e.g. Today's Deal" : "e.g. Spend ₹250, get items at ₹9"} onChange={(e) => set("name", e.target.value)} />
            <FieldError message={show("name")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="offer-desc">Short description (optional)</Label>
            <Textarea id="offer-desc" rows={2} maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} />
            <FieldError message={show("description")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="offer-start">Starts (India time)</Label>
              <Input id="offer-start" type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
              <FieldError message={show("starts_at")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="offer-end">Ends (India time){cfg.endRequired ? "" : " (optional)"}</Label>
              <Input id="offer-end" type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
              {!cfg.endRequired && <p className="text-xs text-muted-foreground">Leave empty to run until you switch it off.</p>}
              <FieldError message={show("ends_at")} />
            </div>
          </div>

          {cfg.usesMinCart && (
            <div className="space-y-1 sm:w-1/2">
              <Label htmlFor="offer-min">Minimum cart amount (₹)</Label>
              <Input id="offer-min" inputMode="decimal" value={form.min_cart_value} onChange={(e) => set("min_cart_value", e.target.value)} />
              <p className="text-xs text-muted-foreground">The offer items themselves don't count towards this amount.</p>
              <FieldError message={show("min_cart_value")} />
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Limits</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="offer-per-order">At offer price, per order</Label>
                <Input id="offer-per-order" inputMode="numeric" value={form.max_units_per_order} onChange={(e) => set("max_units_per_order", e.target.value)} />
                <p className="text-xs text-muted-foreground">Extra units are charged at the normal price.</p>
                <FieldError message={show("max_units_per_order")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer-per-customer">Per customer (optional)</Label>
                <Input id="offer-per-customer" inputMode="numeric" placeholder="No limit" value={form.max_units_per_customer} onChange={(e) => set("max_units_per_customer", e.target.value)} />
                <Select value={form.customer_limit_period} onValueChange={(v) => set("customer_limit_period", v as LimitPeriod)} disabled={!form.max_units_per_customer.trim()}>
                  <SelectTrigger aria-label="Customer limit period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">per day</SelectItem>
                    <SelectItem value="offer">for the whole offer</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={show("max_units_per_customer")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer-cap">Total available (optional)</Label>
                <Input id="offer-cap" inputMode="numeric" placeholder="No limit" value={form.total_units_cap} onChange={(e) => set("total_units_cap", e.target.value)} />
                <p className="text-xs text-muted-foreground">Across all customers.</p>
                <FieldError message={show("total_units_cap")} />
              </div>
            </div>
            <div className="space-y-1 sm:w-1/2">
              <Label htmlFor="offer-audience">Who can use it</Label>
              <Select value={form.audience} onValueChange={(v) => set("audience", v as OfferAudience)}>
                <SelectTrigger id="offer-audience"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABELS) as OfferAudience[]).map((a) => (
                    <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Products and offer prices</h3>
            <ProductPicker products={products} variantsByProduct={variantsByProduct} chosen={chosen} onAdd={addItem} />
            <FieldError message={show("items")} />
            {form.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products yet.</p>
            ) : (
              <ul className="space-y-2">
                {form.items.map((it, i) => {
                  const warn = priceWarning(it);
                  const off = percentOff(it.price, it.offer_price);
                  return (
                    <li key={`${it.product_id}:${it.variant_id ?? ""}`} className="rounded-md border p-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {it.name}{it.variant_label ? ` (${it.variant_label})` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Normal {rupees(it.price)}{it.member_price != null ? ` · Members ${rupees(it.member_price)}` : ""}
                            {!it.product_active && " · hidden from the shop"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`offer-price-${i}`} className="sr-only">Offer price</Label>
                          <span className="text-sm text-muted-foreground">₹</span>
                          <Input id={`offer-price-${i}`} className="w-24" inputMode="decimal" placeholder="Price" value={it.offer_price} onChange={(e) => setItemPrice(i, e.target.value)} />
                          {off != null && <Badge variant="secondary">{off}% off</Badge>}
                          <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${it.name}`} onClick={() => removeItem(i)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {touched && errors[`item_${i}`] && <p className="mt-1 text-xs text-destructive">{errors[`item_${i}`]}</p>}
                      {warn && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{warn}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="offer-active">Switch this offer on</Label>
              <p className="text-xs text-muted-foreground">
                It runs between the dates above. Customers won't see any offers until checkout support is released.
              </p>
            </div>
            <Switch id="offer-active" checked={form.is_active} onCheckedChange={(c) => set("is_active", c)} />
          </div>

          {touched && Object.keys(errors).length > 0 && (
            <p className="text-sm text-destructive">Please fix the highlighted fields.</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? "Save changes" : "Create offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
