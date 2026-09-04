import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "./ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  member_price: number | null;
  images: string[];
  is_featured: boolean;
  is_fast_selling: boolean;
  stock_quantity: number | null;
  unit_type: string | null;
  unit_value: number | null;
  category_id: string | null;
  categories: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Section {
  title: string;
  seeAllHref: string;
  products: Product[];
}

const PRODUCT_COLUMNS = `
  id, name, slug, price, compare_at_price, member_price, images,
  is_featured, is_fast_selling, stock_quantity, unit_type, unit_value, category_id, categories (name)
`;

/**
 * Browsable multi-item showcase for post-order confirmation screens.
 * Reuses the compact ProductCard variant so pricing/cart logic stays in one place.
 */
export function PostOrderProducts() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [categoriesRes, featuredRes, latestRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, slug")
          .eq("is_active", true)
          .is("parent_id", null)
          .order("display_order")
          .limit(2),
        supabase
          .from("products")
          .select(PRODUCT_COLUMNS)
          .eq("is_active", true)
          .eq("is_featured", true)
          .limit(8),
        supabase
          .from("products")
          .select(PRODUCT_COLUMNS)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (cancelled) return;

      const categories = (categoriesRes.data || []) as Category[];
      const featured = (featuredRes.data || []) as Product[];
      const latest = (latestRes.data || []) as Product[];

      let categoryProducts: Product[] = [];
      if (categories.length > 0) {
        const { data } = await supabase
          .from("products")
          .select(PRODUCT_COLUMNS)
          .eq("is_active", true)
          .in("category_id", categories.map((c) => c.id))
          .limit(30);
        categoryProducts = (data || []) as Product[];
      }
      if (cancelled) return;

      const built: Section[] = [];
      categories.forEach((category) => {
        const products = categoryProducts.filter((p) => p.category_id === category.id).slice(0, 8);
        if (products.length > 0) {
          built.push({ title: category.name, seeAllHref: `/products?category=${category.slug}`, products });
        }
      });
      if (featured.length > 0) {
        built.push({ title: "Featured Products", seeAllHref: "/products", products: featured });
      }
      if (latest.length > 0) {
        built.push({ title: "New Arrivals", seeAllHref: "/products", products: latest });
      }

      setSections(built);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-[30%] min-w-[104px] sm:w-36 aspect-[3/4] shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.title}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">{section.title}</h3>
            <Link
              to={section.seeAllHref}
              className="text-sm font-medium text-primary hover:text-primary/80 py-2 px-1 -mr-1"
            >
              See All
            </Link>
          </div>
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-proximity"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {section.products.map((product) => (
              <div key={product.id} className="shrink-0 w-[30%] min-w-[104px] sm:w-36 snap-start">
                <ProductCard
                  variant="compact"
                  id={product.id}
                  name={product.name}
                  slug={product.slug}
                  price={product.price}
                  memberPrice={product.member_price}
                  originalPrice={product.compare_at_price || undefined}
                  image={product.images?.[0] || "/placeholder.svg"}
                  category={product.categories?.name || "General"}
                  isBestSeller={product.is_featured}
                  isFastSelling={product.is_fast_selling}
                  stockQuantity={product.stock_quantity}
                  unitType={product.unit_type}
                  unitValue={product.unit_value}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default PostOrderProducts;
