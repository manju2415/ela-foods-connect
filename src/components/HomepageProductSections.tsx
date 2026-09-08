import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useStorePickupStockMap } from "@/hooks/useStorePickupStock";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface HomepageProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  member_price: number | null;
  images: string[];
  is_featured: boolean;
  is_fast_selling: boolean;
  sales_count: number;
  stock_quantity: number | null;
  unit_type: string | null;
  unit_value: number | null;
  created_at: string;
  category_name: string | null;
}

interface HomepageSection {
  sectionKey: "featured" | "bestSellers" | "newArrivals";
  title: string;
  products: HomepageProduct[];
}

const sectionCopy: Record<HomepageSection["sectionKey"], string> = {
  featured: "Hand-picked products selected by our team.",
  bestSellers: "The products customers are buying most.",
  newArrivals: "Fresh additions to the Ela Bazar collection.",
};

export default function HomepageProductSections() {
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["homepage-product-sections"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_homepage_product_sections",
      );
      if (error) throw error;
      return (data ?? []) as unknown as HomepageSection[];
    },
  });

  const sectionsHaveProducts = sections.some((s) => s.products.length > 0);
  const allProductIds = sections.flatMap((s) => s.products.map((p) => p.id));
  const { data: storePickupStockMap } = useStorePickupStockMap(allProductIds);

  // If every enabled section resolves empty (or none are enabled), still
  // show something rather than leaving the homepage looking broken.
  const { data: fallbackProducts = [] } = useQuery({
    queryKey: ["homepage-fallback-products"],
    staleTime: 5 * 60 * 1000,
    enabled: !isLoading && !sectionsHaveProducts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, price, compare_at_price, member_price, images, is_featured, is_fast_selling, sales_count, stock_quantity, unit_type, unit_value, created_at",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as HomepageProduct[];
    },
  });
  const { data: fallbackStorePickupStockMap } = useStorePickupStockMap(fallbackProducts.map((p) => p.id));

  if (isLoading) {
    return (
      <section className="bg-background py-12 sm:py-16 md:py-20">
        <div className="container mx-auto px-4">
          <Skeleton className="mx-auto mb-8 h-9 w-64" />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[3/4] w-full rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!sectionsHaveProducts && fallbackProducts.length > 0) {
    return (
      <section className="bg-background py-12 sm:py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="mb-7 flex items-end justify-between gap-4 sm:mb-10">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl md:text-4xl">
                Our Products
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Take a look at what we have in store.
              </p>
            </div>
            <Link
              to="/products"
              className="hidden shrink-0 items-center gap-1 font-semibold text-primary hover:text-primary/80 sm:flex"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {fallbackProducts.map((product, productIndex) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                slug={product.slug}
                price={Number(product.price)}
                memberPrice={product.member_price == null ? null : Number(product.member_price)}
                originalPrice={product.compare_at_price == null ? undefined : Number(product.compare_at_price)}
                image={product.images?.[0] || "/placeholder.svg"}
                category="General"
                isFastSelling={product.is_fast_selling}
                stockQuantity={product.stock_quantity}
                storePickupStock={fallbackStorePickupStockMap?.get(product.id) ?? 0}
                unitType={product.unit_type}
                unitValue={product.unit_value}
                imagePriority={productIndex < 2}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {sections.map((section, sectionIndex) => (
        <section
          key={section.sectionKey}
          className={sectionIndex % 2 ? "bg-muted/30 py-12 sm:py-16 md:py-20" : "bg-background py-12 sm:py-16 md:py-20"}
        >
          <div className="container mx-auto px-4">
            <div className="mb-7 flex items-end justify-between gap-4 sm:mb-10">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-foreground sm:text-3xl md:text-4xl">
                  {section.title}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                  {sectionCopy[section.sectionKey]}
                </p>
              </div>
              <Link
                to="/products"
                className="hidden shrink-0 items-center gap-1 font-semibold text-primary hover:text-primary/80 sm:flex"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {section.products.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                No products are available in this section yet.
              </div>
            ) : (
              <Carousel opts={{ align: "start", dragFree: true }} className="w-full">
                <CarouselContent className="-ml-3 sm:-ml-4">
                  {section.products.map((product, productIndex) => (
                    <CarouselItem
                      key={product.id}
                      className="basis-[78%] pl-3 min-[420px]:basis-1/2 sm:basis-1/2 sm:pl-4 lg:basis-1/4"
                    >
                      <ProductCard
                        id={product.id}
                        name={product.name}
                        slug={product.slug}
                        price={Number(product.price)}
                        memberPrice={product.member_price == null ? null : Number(product.member_price)}
                        originalPrice={product.compare_at_price == null ? undefined : Number(product.compare_at_price)}
                        image={product.images?.[0] || "/placeholder.svg"}
                        category={product.category_name || "General"}
                        isNewArrival={section.sectionKey === "newArrivals"}
                        isBestSeller={section.sectionKey === "bestSellers"}
                        isFastSelling={product.is_fast_selling}
                        stockQuantity={product.stock_quantity}
                        storePickupStock={storePickupStockMap?.get(product.id) ?? 0}
                        unitType={product.unit_type}
                        unitValue={product.unit_value}
                        imagePriority={sectionIndex === 0 && productIndex < 2}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {section.products.length > 4 && (
                  <>
                    <CarouselPrevious className="-left-5 hidden bg-background shadow-warm sm:flex" />
                    <CarouselNext className="-right-5 hidden bg-background shadow-warm sm:flex" />
                  </>
                )}
              </Carousel>
            )}

            <Link
              to="/products"
              className="mt-6 flex items-center justify-center gap-1 font-semibold text-primary sm:hidden"
            >
              View all products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ))}
    </>
  );
}
