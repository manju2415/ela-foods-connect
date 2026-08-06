// Helpers to group products that share the same name and merge their
// pack/weight variants into a single selectable option list.

export interface VariantOption {
  key: string;
  productId: string;
  productSlug: string;
  variantId: string | null;
  label: string;
  price: number;
  memberPrice: number | null;
  stock: number;
}

export interface GroupableProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  member_price?: number | null;
  stock_quantity?: number | null;
  unit_type?: string | null;
  unit_value?: number | null;
  category_id?: string | null;
}

export interface GroupableVariant {
  id: string;
  product_id: string;
  label: string;
  price: number;
  member_price?: number | null;
  stock_quantity?: number | null;
  is_default?: boolean | null;
  display_order?: number | null;
}

export const normalizeProductName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

const unitLabels: Record<string, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  litre: "L",
  packet: "pkt",
  piece: "pc",
  box: "box",
  dozen: "doz",
};

export const baseUnitLabel = (product: GroupableProduct) => {
  if (product.unit_type && product.unit_value) {
    return `${product.unit_value}${unitLabels[product.unit_type] || product.unit_type}`;
  }
  return "Standard";
};

/** Build the option list for one group of same-named products. */
export function buildVariantOptions(
  products: GroupableProduct[],
  variants: GroupableVariant[]
): VariantOption[] {
  const options: VariantOption[] = [];
  products.forEach((product) => {
    const productVariants = variants
      .filter((v) => v.product_id === product.id)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    if (productVariants.length > 0) {
      productVariants.forEach((v) => {
        options.push({
          key: `${product.id}:${v.id}`,
          productId: product.id,
          productSlug: product.slug,
          variantId: v.id,
          label: v.label,
          price: Number(v.price),
          memberPrice: v.member_price != null ? Number(v.member_price) : null,
          stock: Number(v.stock_quantity ?? 0),
        });
      });
    } else {
      options.push({
        key: `${product.id}:base`,
        productId: product.id,
        productSlug: product.slug,
        variantId: null,
        label: baseUnitLabel(product),
        price: Number(product.price),
        memberPrice: product.member_price != null ? Number(product.member_price) : null,
        stock: Number(product.stock_quantity ?? 0),
      });
    }
  });
  return options;
}

/** Group products by normalized name (within the same category). */
export function groupProductsByName<T extends GroupableProduct>(products: T[]): T[][] {
  const groups = new Map<string, T[]>();
  products.forEach((p) => {
    const key = `${normalizeProductName(p.name)}::${p.category_id ?? "none"}`;
    const existing = groups.get(key);
    if (existing) existing.push(p);
    else groups.set(key, [p]);
  });
  return Array.from(groups.values());
}
