import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";

import { emptyVariant, type VariantDraft } from "@/lib/variantDraft";

export type { VariantDraft };

interface VariantsEditorProps {
  variants: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
}

export function VariantsEditor({ variants, onChange }: VariantsEditorProps) {
  const update = (i: number, patch: Partial<VariantDraft>) => {
    const next = [...variants];
    next[i] = { ...next[i], ...patch };
    // Enforce single default
    if (patch.is_default === true) {
      next.forEach((v, idx) => { if (idx !== i) v.is_default = false; });
    }
    onChange(next);
  };
  const remove = (i: number) => onChange(variants.filter((_, idx) => idx !== i));
  const add = () => onChange([...variants, { ...emptyVariant(), display_order: variants.length }]);

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base">Weight / Pack Variants</Label>
          <p className="text-xs text-muted-foreground">Optional. If added, customers pick a variant on the product page.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Add Variant
        </Button>
      </div>

      {variants.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">No variants — product uses its base price and stock.</p>
      ) : (
        variants.map((v, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-2 bg-background rounded border">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Label *</Label>
              <Input placeholder="500 g" value={v.label} onChange={(e) => update(i, { label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <Input type="number" step="0.01" value={v.unit_value} onChange={(e) => update(i, { unit_value: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit</Label>
              <Select value={v.unit_type} onValueChange={(val) => update(i, { unit_type: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="litre">L</SelectItem>
                  <SelectItem value="packet">packet</SelectItem>
                  <SelectItem value="piece">piece</SelectItem>
                  <SelectItem value="box">box</SelectItem>
                  <SelectItem value="dozen">dozen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MRP *</Label>
              <Input type="number" step="0.01" value={v.price} onChange={(e) => update(i, { price: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Member ₹</Label>
              <Input type="number" step="0.01" value={v.member_price} onChange={(e) => update(i, { member_price: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">SKU</Label>
              <Input value={v.sku} onChange={(e) => update(i, { sku: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stock</Label>
              <Input type="number" value={v.stock_quantity} onChange={(e) => update(i, { stock_quantity: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={v.is_default} onCheckedChange={(c) => update(i, { is_default: c })} />
              <Label className="text-xs">Default</Label>
              <Switch checked={v.is_active} onCheckedChange={(c) => update(i, { is_active: c })} />
              <Label className="text-xs">Active</Label>
            </div>
            <div className="flex justify-end sm:col-span-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
