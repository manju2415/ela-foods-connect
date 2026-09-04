import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "./ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

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
  categories: {
    name: string;
  } | null;
}

const FeaturedProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      const columns = `
          id,
          name,
          slug,
          price,
          compare_at_price,
          member_price,
          images,
          is_featured,
          is_fast_selling,
          stock_quantity,
          unit_type,
          unit_value,
          categories (name)
        `;

      const { data, error } = await supabase
        .from("products")
        .select(columns)
        .eq("is_active", true)
        .eq("is_featured", true)
        .limit(10);

      if (error) {
        console.error("Error fetching products:", error);
        setLoading(false);
        return;
      }

      let list = data || [];

      // Top up with other active products so the carousel always has enough items
      if (list.length < 10) {
        const { data: extra } = await supabase
          .from("products")
          .select(columns)
          .eq("is_active", true)
          .eq("is_featured", false)
          .order("created_at", { ascending: false })
          .limit(10 - list.length);

        if (extra?.length) list = [...list, ...extra];
      }

      setProducts(list);
      setLoading(false);
    };

    fetchProducts();
  }, []);


  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Our Collection
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Featured Products
          </h2>
          <p className="text-muted-foreground">
            Top picks loved by thousands of shoppers across the country.
          </p>
        </div>

        {/* Products Carousel */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <Carousel opts={{ align: "start", dragFree: true }} className="w-full">
            <CarouselContent className="-ml-4">
              {products.map((product, index) => (
                <CarouselItem
                  key={product.id}
                  className="pl-4 basis-1/2 sm:basis-1/2 lg:basis-1/4"
                >
                  <ProductCard
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
                    imagePriority={index < 2}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            {products.length > 4 && (
              <>
                <CarouselPrevious className="hidden sm:flex -left-5 z-10 bg-background shadow-warm" />
                <CarouselNext className="hidden sm:flex -right-5 z-10 bg-background shadow-warm" />
              </>
            )}
          </Carousel>
        )}

        {/* View All Button */}
        <div className="text-center mt-12">
          <a
            href="/products"
            className="inline-flex items-center gap-2 text-primary font-semibold hover:text-primary/80 transition-colors"
          >
            View All Products
            <span className="text-lg">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
