import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Skeleton } from "@/components/ui/skeleton";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { ArrowRight, BadgePercent, ChevronRight, Gift, Leaf, LayoutGrid, MapPin, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useImagePreload } from "@/hooks/useImagePreload";
import { useHeroBanner, useHomeBanners, type HeroBanner } from "@/hooks/useHeroBanner";
import { getImageRequestScale, getOptimizedImageUrl } from "@/utils/imageUrl";

// Banner artwork is designed at 2:1 and carries its own text, so it's shown
// uncropped and without overlays.
const BANNER_WIDTH = 1600;
const BANNER_HEIGHT = 800;
const AUTOPLAY_MS = 5000;
const CATEGORY_BAR_LIMIT = 12;

const VALUE_POINTS = [
  { icon: BadgePercent, title: "Wholesale prices", text: "Daily groceries for less" },
  { icon: Leaf, title: "Fresh & local", text: "Sourced from trusted suppliers" },
  { icon: ShieldCheck, title: "Quality guaranteed", text: "Checked before it ships" },
  { icon: Users, title: "Community savings", text: "Shop together, save together" },
];

/** Admin banner artwork, full-bleed inside a rounded card and fully clickable. */
function BannerArtwork({ banner, priority }: { banner: HeroBanner; priority: boolean }) {
  const title = (banner.title || "Ela Bazar").replace(/\n/g, " ");
  return (
    <Link
      to={banner.cta_link || "/products"}
      aria-label={`${title} — ${banner.cta_text || "Shop Now"}`}
      className="group block overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-lg"
    >
      <OptimizedImage
        src={banner.image_url!}
        alt={title}
        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        containerClassName="aspect-[2/1] w-full"
        priority={priority}
        blur={false}
        displayWidth={BANNER_WIDTH}
        displayHeight={BANNER_HEIGHT}
        quality="high"
      />
    </Link>
  );
}

/** Text hero for when no banner artwork has been uploaded. */
function TextHero({ banner, ctaText, ctaLink }: { banner: HeroBanner | null; ctaText: string; ctaLink: string }) {
  const [mainTitle, highlightTitle] = (banner?.title || "Daily groceries\nat wholesale prices").split("\n");
  const subtitle =
    banner?.subtitle ||
    "Join the Ela Bazar community and stock up on dals, rice, flour, spices and more — fresh, local and priced like wholesale.";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent px-6 py-10 text-primary-foreground shadow-sm md:px-12 md:py-14">
      <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary-foreground/10 blur-2xl" />
      <div aria-hidden className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
      <div className="relative max-w-2xl">
        {banner?.badge_text && (
          <span className="mb-5 inline-flex rounded-full bg-primary-foreground/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
            {banner.badge_text}
          </span>
        )}
        <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-5xl">
          {mainTitle}
          {highlightTitle && <span className="block text-secondary">{highlightTitle}</span>}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">{subtitle}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary" className="gap-2 rounded-xl font-semibold shadow-md">
            <Link to={ctaLink}>
              {ctaText}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="gap-2 rounded-xl border-primary-foreground/40 bg-transparent font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/categories">
              <LayoutGrid className="h-4 w-4" />
              Categories
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Compact store-style category bar (image + label) at the top of the home page. */
function CategoryBar() {
  // Same query/key as the app home category grid, so the cache is shared.
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

  const shown = (categories ?? []).slice(0, CATEGORY_BAR_LIMIT);
  if (!isLoading && shown.length === 0) return null;

  const itemClass =
    "group flex w-[68px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-colors hover:bg-primary/5 md:w-[84px]";
  const labelClass = "w-full truncate text-center text-xs font-medium text-foreground group-hover:text-primary md:text-[13px]";

  return (
    <nav aria-label="Shop by category" className="rounded-2xl border border-border/60 bg-card px-2 py-1 shadow-sm md:px-3">
      <div className="flex snap-x gap-1 overflow-x-auto [scrollbar-width:none] md:gap-2 lg:justify-between [&::-webkit-scrollbar]:hidden">
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={itemClass}>
              <Skeleton className="h-11 w-11 rounded-xl md:h-12 md:w-12" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))
        ) : (
          <>
            {shown.map((category) => (
              <Link key={category.id} to={`/category/${category.slug}`} className={itemClass} title={category.name}>
                <span className="h-11 w-11 overflow-hidden rounded-xl bg-muted transition-transform group-hover:-translate-y-0.5 md:h-12 md:w-12">
                  <OptimizedImage
                    src={category.image_url || "/placeholder.svg"}
                    alt=""
                    className="h-full w-full object-cover"
                    containerClassName="h-full w-full"
                    displayWidth={56}
                    displayHeight={56}
                  />
                </span>
                <span className={labelClass}>{category.name}</span>
              </Link>
            ))}
            <Link to="/categories" className={itemClass}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5 md:h-12 md:w-12">
                <LayoutGrid className="h-5 w-5" />
              </span>
              <span className={`${labelClass} font-semibold text-primary`}>All</span>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

/** Row of offer tiles under the banner; scrolls sideways on phones. */
function OfferTiles() {
  const { user } = useAuth();
  const tiles = [
    {
      to: "/products",
      icon: BadgePercent,
      eyebrow: "Today's deals",
      title: "Wholesale prices on daily essentials",
      cta: "Shop deals",
      className: "from-primary to-accent text-primary-foreground",
    },
    {
      to: user ? "/dashboard" : "/signup",
      icon: Gift,
      eyebrow: "Refer & earn",
      title: user ? "Invite friends, earn rewards" : "Become a member & save more",
      cta: user ? "Invite now" : "Join free",
      className: "from-secondary to-secondary/70 text-secondary-foreground",
    },
    {
      to: "/stores",
      icon: MapPin,
      eyebrow: "Store pickup",
      title: "Order online, collect from a store near you",
      cta: "Find a store",
      className: "from-muted to-card text-foreground",
    },
  ];

  return (
    <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
      {tiles.map(({ to, icon: Icon, eyebrow, title, cta, className }) => (
        <Link
          key={eyebrow}
          to={to}
          className={`group relative flex w-[78%] shrink-0 snap-start items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br p-4 shadow-sm ring-1 ring-border/50 transition-shadow hover:shadow-lg sm:w-[46%] md:w-auto md:p-5 ${className}`}
        >
          <div aria-hidden className="absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-background/15" />
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background/25">
            <Icon className="h-6 w-6" />
          </span>
          <span className="relative min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider opacity-80">{eyebrow}</span>
            <span className="mt-0.5 block text-sm font-bold leading-snug md:text-base">{title}</span>
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold">
              {cta}
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

const HeroSection = () => {
  // Cached first banner paints instantly; the full list fills in the carousel.
  const { data: firstBanner } = useHeroBanner();
  const { data: allBanners } = useHomeBanners();
  const banners = allBanners && allBanners.length > 0 ? allBanners : firstBanner ? [firstBanner] : [];
  const artworkBanners = banners.filter((b) => b.image_url);
  const primaryBanner = artworkBanners[0] ?? banners[0] ?? null;

  const ctaText = primaryBanner?.cta_text || "Shop Now";
  const ctaLink = primaryBanner?.cta_link || "/products";

  // Preload the first artwork for LCP — must match the URL OptimizedImage
  // requests (displayWidth/Height + quality="high").
  const heroImage = artworkBanners[0]?.image_url || "";
  const heroPreloadSrc = heroImage
    ? getOptimizedImageUrl(heroImage, {
        width: Math.round(BANNER_WIDTH * getImageRequestScale(BANNER_WIDTH)),
        height: Math.round(BANNER_HEIGHT * getImageRequestScale(BANNER_WIDTH)),
        quality: 90,
      })
    : "";
  useImagePreload(heroPreloadSrc ? [heroPreloadSrc] : []);

  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  // Several slides are visible at once on wide screens, so the number of
  // scroll positions can be lower than the number of banners.
  const [snapCount, setSnapCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const slideCount = artworkBanners.length;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    const onReInit = () => {
      setSnapCount(api.scrollSnapList().length);
      onSelect();
    };
    api.on("select", onSelect);
    api.on("reInit", onReInit);
    onReInit();
    const cleanup = () => {
      api.off("select", onSelect);
      api.off("reInit", onReInit);
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (slideCount < 2 || paused || reduceMotion) return cleanup;
    const timer = window.setInterval(() => {
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, AUTOPLAY_MS);
    return () => {
      window.clearInterval(timer);
      cleanup();
    };
  }, [api, slideCount, paused]);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/[0.06] via-background to-background">
      <div className="container relative mx-auto max-w-6xl px-4 pb-8 pt-3 md:pb-10 md:pt-4">
        <CategoryBar />

        <div className="mt-4">
          {slideCount === 0 ? (
            <TextHero banner={primaryBanner} ctaText={ctaText} ctaLink={ctaLink} />
          ) : (
            <>
              {/* The artwork carries the visible headline; keep a real h1 for SEO / screen readers. */}
              <h1 className="sr-only">{(primaryBanner?.title || "Ela Bazar").replace(/\n/g, " ")}</h1>
              {slideCount === 1 ? (
                <BannerArtwork banner={artworkBanners[0]} priority />
              ) : (
                <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                  <Carousel setApi={setApi} opts={{ loop: true, align: "start" }} className="w-full">
                    <CarouselContent className="-ml-3 md:-ml-4">
                      {artworkBanners.map((banner, index) => (
                        <CarouselItem key={banner.id} className="basis-[90%] pl-3 md:basis-1/2 md:pl-4">
                          <BannerArtwork banner={banner} priority={index === 0} />
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-3 hidden h-10 w-10 border-0 bg-background/90 shadow-md backdrop-blur disabled:hidden md:flex" />
                    <CarouselNext className="right-3 hidden h-10 w-10 border-0 bg-background/90 shadow-md backdrop-blur disabled:hidden md:flex" />
                  </Carousel>
                  {snapCount > 1 && (
                    <div className="mt-3 flex justify-center gap-1.5">
                      {Array.from({ length: snapCount }).map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => api?.scrollTo(index)}
                          aria-label={`Show banner ${index + 1}`}
                          aria-current={index === selected}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            index === selected ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <OfferTiles />

        {/* Trust strip */}
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:mt-5 md:grid-cols-4 md:p-5">
          {VALUE_POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight text-foreground">{title}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default HeroSection;
