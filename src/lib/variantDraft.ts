export interface VariantDraft {
  id?: string;
  label: string;
  unit_value: string;
  unit_type: string;
  price: string;
  member_price: string;
  stock_quantity: string;
  sku: string;
  is_default: boolean;
  is_active: boolean;
  display_order: number;
}

export const emptyVariant = (): VariantDraft => ({
  label: "",
  unit_value: "",
  unit_type: "g",
  price: "",
  member_price: "",
  stock_quantity: "0",
  sku: "",
  is_default: false,
  is_active: true,
  display_order: 0,
});
