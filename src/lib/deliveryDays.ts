import { addDays, format, startOfToday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { untypedSupabase } from "@/lib/untypedSupabase";

// Delivery-day rules: a category may be limited to certain weekdays
// (categories.delivery_weekdays, 0 = Sunday), and admins can close or open
// specific dates (delivery_date_overrides). A date is offered at checkout only
// if every item in the cart can be delivered on it.

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DeliveryCategory {
  id: string;
  parent_id: string | null;
  delivery_weekdays: number[] | null;
}

export interface DeliveryOverride {
  override_date: string; // yyyy-MM-dd
  category_id: string | null;
  is_available: boolean;
}

// How far ahead checkout looks for dates, and how many it shows.
export const SEARCH_DAYS = 60;
export const MAX_DATES_SHOWN = 7;

// A category's own weekday rule, falling back to its parent's.
function weekdaysFor(categoryId: string | null, categories: Map<string, DeliveryCategory>): number[] | null {
  if (!categoryId) return null;
  const category = categories.get(categoryId);
  if (!category) return null;
  if (category.delivery_weekdays && category.delivery_weekdays.length > 0) return category.delivery_weekdays;
  const parent = category.parent_id ? categories.get(category.parent_id) : undefined;
  if (parent?.delivery_weekdays && parent.delivery_weekdays.length > 0) return parent.delivery_weekdays;
  return null;
}

export function isDeliverableOn(
  date: Date,
  categoryId: string | null,
  categories: Map<string, DeliveryCategory>,
  overrides: DeliveryOverride[],
): boolean {
  const key = format(date, "yyyy-MM-dd");
  const onDate = overrides.filter((o) => o.override_date === key);

  // Most specific override wins: the category, then its parent, then store-wide.
  const category = categoryId ? categories.get(categoryId) : undefined;
  for (const scope of [categoryId, category?.parent_id ?? null]) {
    if (!scope) continue;
    const specific = onDate.find((o) => o.category_id === scope);
    if (specific) return specific.is_available;
  }
  const storeWide = onDate.find((o) => o.category_id === null);
  if (storeWide && !storeWide.is_available) return false;

  const weekdays = weekdaysFor(categoryId, categories);
  return weekdays === null || weekdays.includes(date.getDay());
}

// Dates (from tomorrow) on which every given category can be delivered.
export function availableDeliveryDates(
  categoryIds: (string | null)[],
  categories: Map<string, DeliveryCategory>,
  overrides: DeliveryOverride[],
): Date[] {
  const ids = categoryIds.length > 0 ? Array.from(new Set(categoryIds)) : [null];
  const dates: Date[] = [];
  for (let i = 1; i <= SEARCH_DAYS && dates.length < MAX_DATES_SHOWN; i++) {
    const date = addDays(startOfToday(), i);
    if (ids.every((id) => isDeliverableOn(date, id, categories, overrides))) dates.push(date);
  }
  return dates;
}

export interface DeliveryRules {
  categoryIds: (string | null)[];
  categories: Map<string, DeliveryCategory>;
  overrides: DeliveryOverride[];
  // Names of cart categories that are limited to certain weekdays, for display.
  restrictedLabels: string[];
}

// Loads the rules for the given products. Any failure (e.g. the delivery
// columns are not deployed yet) returns no restrictions, so checkout behaves
// exactly as it did before this feature.
export async function loadDeliveryRules(productIds: string[]): Promise<DeliveryRules> {
  const empty: DeliveryRules = { categoryIds: [], categories: new Map(), overrides: [], restrictedLabels: [] };
  try {
    // From today: same-day delivery checks today's overrides too.
    const today = format(startOfToday(), "yyyy-MM-dd");
    const until = format(addDays(startOfToday(), SEARCH_DAYS), "yyyy-MM-dd");

    const [productsRes, categoriesRes, overridesRes] = await Promise.all([
      productIds.length > 0
        ? supabase.from("products").select("id, category_id").in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      untypedSupabase.from("categories").select("id, name, parent_id, delivery_weekdays"),
      untypedSupabase
        .from("delivery_date_overrides")
        .select("override_date, category_id, is_available")
        .gte("override_date", today)
        .lte("override_date", until),
    ]);

    if (productsRes.error || categoriesRes.error) return empty;

    const categoryRows = (categoriesRes.data ?? []) as (DeliveryCategory & { name: string })[];
    const categories = new Map(categoryRows.map((c) => [c.id, c]));
    const categoryIds = ((productsRes.data ?? []) as { category_id: string | null }[]).map((p) => p.category_id);

    const restrictedLabels = Array.from(new Set(categoryIds))
      .map((id) => {
        const weekdays = weekdaysFor(id, categories);
        if (!id || !weekdays) return null;
        const days = [...weekdays].sort().map((d) => WEEKDAY_LABELS[d]).join(", ");
        return `${categories.get(id)?.name ?? "Some items"}: ${days} only`;
      })
      .filter((label): label is string => label !== null);

    return {
      categoryIds,
      categories,
      // The overrides table may not exist yet; treat that as no overrides.
      overrides: overridesRes.error ? [] : ((overridesRes.data ?? []) as DeliveryOverride[]),
      restrictedLabels,
    };
  } catch {
    return empty;
  }
}
