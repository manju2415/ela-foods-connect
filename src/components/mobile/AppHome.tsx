import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gift, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useHeroBanner, useHomeBanners, type HeroBanner } from "@/hooks/useHeroBanner";
import { useStorePickupStockMap } from "@/hooks/useStorePickupStock";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Skeleton } from "@/components/ui/skeleton";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import ProductCard from "@/components/ProductCard";
import HomepageProductSections from "@/components/HomepageProductSections";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";

// Grid shows this many categories, then an "All" tile for the rest.
const GRID_CATEGORY_LIMIT = 7;
const ROW_LIMIT = 12;
const BANNER_AUTOPLAY_MS = 4000;

const PRODUCT_FIELDS =
  "id, name, slug, price, compare_at_price, member_price, images, is_fast_selling, stock_quantity, unit_type, unit_value";

interface RowProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  member_price: number | null;
  images: string[] | null;
  is_fast_selling: boolean | null;
  stock_quantity: number | null;
  unit_type: string | null;
  unit_value: number | null;
}

/** One banner slide: artwork shown clean (it carries its own text), or a text card. */
function BannerSlide({ banner, priority }: { banner: HeroBanner | null; priority: boolean }) {
  const [mainTitle, highlightTitle] = (banner?.title || "Fresh groceries at wholesale prices").split("\n");
  const ctaText = banner?.cta_text || "Shop Now";
  const ctaLink = banner?.cta_link || "/products";

  if (banner?.image_url) {
    return (
      <Link
        to={ctaLink}
        aria-label={`${mainTitle} — ${ctaText}`}
        className="relative block aspect-video overflow-hidden rounded-2xl bg-muted shadow-sm"
      >
        <OptimizedImage
          src={banner.image_url}
          alt={mainTitle}
          className="h-full w-full object-cover"
          containerClassName="h-full w-full"
          priority={priority}
          blur={false}
          displayWidth={800}
          displayHeight={450}
        />
      </Link>
    );
  }

  return (
    <Link
      to={ctaLink}
      className="relative block aspect-[2/1] overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent shadow-sm"
    >
      <div className="absolute inset-0 flex flex-col justify-center gap-1 p-4 text-card">
        {banner?.badge_text && (
          <span className="w-fit rounded-full bg-secondary/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
            {banner.badge_text}
          </span>
        )}
        <p className="max-w-[70%] text-lg font-extrabold leading-tight">
          {mainTitle}
          {highlightTitle && <span className="block text-secondary">{highlightTitle}</span>}
        </p>
        <span className="mt-1 flex w-fit items-center gap-0.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-foreground">
          {ctaText} <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Short banner carousel of every active home banner (same `home_hero`
 * banners the admin manages). With one banner it's a single card.
 */
function AppBannerCarousel() {
  // The website's single banner, served instantly from its cache.
  const { data: firstBanner } = useHeroBanner();
  const { data: banners } = useHomeBanners();

  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const slides = banners && banners.length > 0 ? banners : [firstBanner ?? null];

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on("select", onSelect);
    onSelect();
    if (slides.length < 2) return () => void api.off("select", onSelect);
    const timer = window.setInterval(() => api.scrollNext(), BANNER_AUTOPLAY_MS);
    return () => {
      window.clearInterval(timer);
      api.off("select", onSelect);
    };
  }, [api, slides.length]);

  if (slides.length === 1) {
    return (
      <div className="px-4 pt-4">
        <BannerSlide banner={slides[0]} priority />
      </div>
    );
  }

  return (
    <div className="pt-4">
      <Carousel setApi={setApi} opts={{ loop: true }}>
        <CarouselContent className="-ml-3 px-4">
          {slides.map((banner, index) => (
            <CarouselItem key={banner?.id ?? index} className="basis-[92%] pl-3">
              <BannerSlide banner={banner} priority={index === 0} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
        {slides.map((banner, index) => (
          <span
            key={banner?.id ?? index}
            className={`h-1.5 rounded-full transition-all ${index === selected ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** 4-column category icon grid with an "All" tile. */
function AppCategoryGrid() {
  const { data: categories, isLoading } = useQuery({
    queryKey: ["app-home-categories"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, image_url")
        .eq("is_active", true)
        .is("parent_id", null)
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const shown = (categories ?? []).slice(0, GRID_CATEGORY_LIMIT);
  if (!isLoading && shown.length === 0) return null;

  return (
    <section className="px-4 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Shop by category</h2>
        <Link to="/categories" className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary">
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))
          : (
            <>
              {shown.map((category) => (
                <Link key={category.id} to={`/category/${category.slug}`} className="flex flex-col items-center gap-1.5">
                  <span className="aspect-square w-full overflow-hidden rounded-2xl bg-muted/70">
                    <OptimizedImage
                      src={category.image_url || "/placeholder.svg"}
                      alt=""
                      className="h-full w-full object-cover"
                      containerClassName="h-full w-full"
                      displayWidth={96}
                      displayHeight={96}
                    />
                  </span>
                  <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-foreground">
                    {category.name}
                  </span>
                </Link>
              ))}
              <Link to="/categories" className="flex flex-col items-center gap-1.5">
                <span className="flex aspect-square w-full items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <LayoutGrid className="h-7 w-7" />
                </span>
                <span className="text-center text-[11px] font-semibold leading-tight text-primary">All</span>
              </Link>
            </>
          )}
      </div>
    </section>
  );
}

/** Horizontal product row (same ProductCard as everywhere, compact size). */
function AppProductRow({
  title,
  products,
  isLoading,
  seeAllTo = "/products",
}: {
  title: string;
  products: RowProduct[] | undefined;
  isLoading: boolean;
  seeAllTo?: string;
}) {
  const { data: storePickupStockMap } = useStorePickupStockMap((products ?? []).map((p) => p.id));

  if (isLoading) {
    return (
      <section className="px-4 py-4">
        <Skeleton className="mb-3 h-6 w-40" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-[42%] shrink-0 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }
  if (!products || products.length === 0) return null;

  return (
    <section className="py-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <h2 className="min-w-0 truncate text-lg font-bold text-foreground">{title}</h2>
        <Link to={seeAllTo} className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary">
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <Carousel opts={{ align: "start", dragFree: true }} className="w-full">
        <CarouselContent className="-ml-3 px-4">
          {products.map((product) => (
            <CarouselItem key={product.id} className="basis-[44%] pl-3 min-[420px]:basis-[38%]">
              <ProductCard
                id={product.id}
                name={product.name}
                slug={product.slug}
                price={Number(product.price)}
                memberPrice={product.member_price == null ? null : Number(product.member_price)}
                originalPrice={product.compare_at_price == null ? undefined : Number(product.compare_at_price)}
                image={product.images?.[0] || "/placeholder.svg"}
                category="General"
                isFastSelling={!!product.is_fast_selling}
                stockQuantity={product.stock_quantity}
                storePickupStock={storePickupStockMap?.get(product.id) ?? 0}
                unitType={product.unit_type}
                unitValue={product.unit_value}
                variant="compact"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}

/** Products from the customer's recent orders, most recent first. */
function OrderAgainRow() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["app-home-order-again", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", user!.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(10);
      if (ordersError) throw ordersError;
      if (!orders?.length) return [] as RowProduct[];

      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("product_id, order_id")
        .in("order_id", orders.map((o) => o.id));
      if (itemsError) throw itemsError;

      const orderRank = new Map(orders.map((o, i) => [o.id, i]));
      const productIds = [
        ...new Set(
          (orderItems ?? [])
            .filter((item) => item.product_id)
            .sort((a, b) => (orderRank.get(a.order_id) ?? 0) - (orderRank.get(b.order_id) ?? 0))
            .map((item) => item.product_id as string),
        ),
      ].slice(0, ROW_LIMIT);
      if (productIds.length === 0) return [] as RowProduct[];

      const { data: products, error: productsError } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .in("id", productIds)
        .eq("is_active", true);
      if (productsError) throw productsError;
      return ((products ?? []) as unknown as RowProduct[]).sort(
        (a, b) => productIds.indexOf(a.id) - productIds.indexOf(b.id),
      );
    },
  });

  if (!user) return null;
  return <AppProductRow title="Order again" products={data} isLoading={isLoading} />;
}

/** Products marked fast-selling by the admin. */
function FastSellingRow() {
  const { data, isLoading } = useQuery({
    queryKey: ["app-home-fast-selling"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("is_active", true)
        .eq("is_fast_selling", true)
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT);
      if (error) throw error;
      return (products ?? []) as unknown as RowProduct[];
    },
  });
  return <AppProductRow title="Selling fast" products={data} isLoading={isLoading} />;
}

/** Products whose MRP is below their original (compare-at) price. */
function DealsRow() {
  const { data, isLoading } = useQuery({
    queryKey: ["app-home-deals"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("is_active", true)
        .not("compare_at_price", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((products ?? []) as unknown as RowProduct[])
        .filter((p) => Number(p.compare_at_price) > Number(p.price))
        .slice(0, ROW_LIMIT);
    },
  });
  return <AppProductRow title="Top deals" products={data} isLoading={isLoading} />;
}

/** Compact version of the website's referral banner — same destinations. */
function AppReferralCard() {
  return (
    <section className="px-4 py-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-gradient-to-r from-secondary/25 to-primary/10 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card shadow-sm">
          <Gift className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight text-foreground">Refer friends &amp; earn rewards</p>
          <p className="text-xs text-muted-foreground">Invite friends with your referral code.</p>
        </div>
        <Link
          to="/signup"
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          Join
        </Link>
      </div>
      <Link to="/about" className="mt-2 block text-center text-xs font-medium text-muted-foreground">
        Learn more about Ela Bazar
      </Link>
    </section>
  );
}

/**
 * Installed-app home content: banner carousel, category grid, order again,
 * the admin's homepage rows, selling fast, top deals. Reuses the website's
 * data sources; the website home is unchanged.
 */
export function AppHome() {
  return (
    <div className="pb-4">
      <AppBannerCarousel />
      <AdvertisementBanner placement="home_top" className="px-4 pt-4" />
      <AppCategoryGrid />
      <div className="pt-2">
        <OrderAgainRow />
        <HomepageProductSections variant="app" />
        <FastSellingRow />
        <DealsRow />
      </div>
      <AdvertisementBanner placement="home_sidebar" className="px-4 pt-2" />
      <AdvertisementBanner placement="home_bottom" className="px-4 pt-4" />
      <AppReferralCard />
    </div>
  );
}
