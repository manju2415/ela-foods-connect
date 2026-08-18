import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CategoryCard from "./CategoryCard";
import { Skeleton } from "@/components/ui/skeleton";

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  product_count: number;
  parent_id: string | null;
}

const CategoriesSection = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      // Fetch categories - only parent categories for homepage display
      const { data: categoriesData, error: catError } = await supabase
        .from("categories")
        .select("id, name, slug, image_url, parent_id")
        .eq("is_active", true)
        .is("parent_id", null) // Only get parent categories
        .order("display_order");

      if (catError) {
        console.error("Error fetching categories:", catError);
        setLoading(false);
        return;
      }

      // Fetch all subcategory IDs for parent categories to count their products too
      const { data: subcategories } = await supabase
        .from("categories")
        .select("id, parent_id")
        .eq("is_active", true)
        .not("parent_id", "is", null);

      // Create a map of parent_id -> subcategory ids
      const subcategoryMap = new Map<string, string[]>();
      subcategories?.forEach((sub) => {
        if (sub.parent_id) {
          const existing = subcategoryMap.get(sub.parent_id) || [];
          subcategoryMap.set(sub.parent_id, [...existing, sub.id]);
        }
      });

      // Fetch product counts per category (including subcategories)
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("category_id")
        .eq("is_active", true);

      if (prodError) {
        console.error("Error fetching products:", prodError);
      }

      // Count products per category (including subcategory products for parents)
      const countMap: Record<string, number> = {};
      products?.forEach((p) => {
        if (p.category_id) {
          countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
        }
      });

      const categoriesWithCount = (categoriesData || []).map((cat) => {
        // Get subcategory IDs for this parent
        const subIds = subcategoryMap.get(cat.id) || [];
        // Sum products in parent + all subcategories
        const parentCount = countMap[cat.id] || 0;
        const subCount = subIds.reduce((acc, subId) => acc + (countMap[subId] || 0), 0);
        return {
          ...cat,
          product_count: parentCount + subCount,
        };
      });

      setCategories(categoriesWithCount);
      setLoading(false);
    };

    fetchCategories();
  }, []);

  return (
    <section className="py-16 md:py-24 bg-muted">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Browse By Category
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Shop by Category
          </h2>
          <p className="text-muted-foreground">
            Explore our collections organized by category for easy shopping.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))
          ) : (
            categories.map((category) => (
              <CategoryCard
                key={category.id}
                name={category.name}
                slug={category.slug}
                image={category.image_url || "/placeholder.svg"}
                productCount={category.product_count}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;
