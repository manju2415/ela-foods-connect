import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { baseUnitLabel, normalizeProductName } from "@/lib/variantOptions";
import { matchesProductSearch, productSearchRank } from "@/lib/productSearch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const MAX_SUGGESTIONS = 8;

interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: string[] | null;
  unit_type: string | null;
  unit_value: number | null;
  categories: { name: string } | null;
}

interface ProductSearchSuggestionsProps {
  query: string;
  /** A product was picked: the parent navigates and closes the list. */
  onPickProduct: (slug: string) => void;
  /** "See all results" was picked: same as pressing the Search button. */
  onSeeAll: () => void;
  className?: string;
}

/**
 * Live results shown under a search box while the user types, before the
 * Search button is pressed. The active catalogue is loaded once and cached,
 * so typing filters it locally instead of querying on every keystroke.
 */
export function ProductSearchSuggestions({ query, onPickProduct, onSeeAll, className = "" }: ProductSearchSuggestionsProps) {
  const debouncedQuery = useDebouncedValue(query.trim(), 150);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["product-search-catalog"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, images, unit_type, unit_value, categories (name)")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("is_fast_selling", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CatalogProduct[];
    },
  });

  const results = useMemo(() => {
    if (!debouncedQuery || !catalog) return [];
    const seen = new Set<string>();
    return catalog
      .filter((p) => matchesProductSearch(debouncedQuery, p.name))
      .map((p, index) => ({ p, index, rank: productSearchRank(debouncedQuery, p.name) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ p }) => p)
      // Same-named products are pack sizes of one product: list it once.
      .filter((p) => {
        const key = normalizeProductName(p.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [catalog, debouncedQuery]);

  if (!query.trim()) return null;

  const shown = results.slice(0, MAX_SUGGESTIONS);
  const waiting = isLoading || debouncedQuery !== query.trim();

  return (
    <div
      // Keep focus in the search box so a tap here doesn't close the list first.
      onMouseDown={(event) => event.preventDefault()}
      className={`absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl ${className}`}
      role="listbox"
      aria-label="Search suggestions"
    >
      {shown.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          {waiting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </>
          ) : (
            <>No products found for "{query.trim()}"</>
          )}
        </div>
      ) : (
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {shown.map((product) => {
            const unit = product.unit_type && product.unit_value ? baseUnitLabel(product) : null;
            return (
              <li key={product.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onPickProduct(product.slug)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  <img
                    src={product.images?.[0] || "/placeholder.svg"}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-lg border border-border bg-white object-contain"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[product.categories?.name, unit].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">₹{product.price}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onSeeAll}
        className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm font-semibold text-primary hover:bg-muted"
      >
        <Search className="h-4 w-4" />
        {results.length > shown.length
          ? `See all ${results.length} results for "${query.trim()}"`
          : `See all results for "${query.trim()}"`}
      </button>
    </div>
  );
}
