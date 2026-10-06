import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { ArrowRight, BadgePercent, Leaf, LayoutGrid, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useImagePreload } from "@/hooks/useImagePreload";
import { useHeroBanner, useHomeBanners, type HeroBanner } from "@/hooks/useHeroBanner";
import { getImageRequestScale, getOptimizedImageUrl } from "@/utils/imageUrl";

// Banner artwork is designed at 2:1 and carries its own text, so it's shown
// uncropped and without overlays.
const BANNER_WIDTH = 1600;
const BANNER_HEIGHT = 800;
const AUTOPLAY_MS = 5000;

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
      className="group block overflow-hidden rounded-2xl bg-muted shadow-[0_12px_40px_-12px_hsl(var(--foreground)/0.25)] ring-1 ring-border/60 md:rounded-3xl"
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
function TextHero({ banner }: { banner: HeroBanner | null }) {
  const [mainTitle, highlightTitle] = (banner?.title || "Daily groceries\nat wholesale prices").split("\n");
  const subtitle =
    banner?.subtitle ||
    "Join the Ela Bazar community and stock up on dals, rice, flour, spices and more — fresh, local and priced like wholesale.";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent px-6 py-12 text-primary-foreground shadow-[0_12px_40px_-12px_hsl(var(--foreground)/0.25)] md:rounded-3xl md:px-14 md:py-20">
      <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary-foreground/10 blur-2xl" />
      <div aria-hidden className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
      <div className="relative max-w-2xl">
        {banner?.badge_text && (
          <span className="mb-5 inline-flex rounded-full bg-primary-foreground/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
            {banner.badge_text}
          </span>
        )}
        <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
          {mainTitle}
          {highlightTitle && <span className="block text-secondary">{highlightTitle}</span>}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">{subtitle}</p>
      </div>
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
  const [paused, setPaused] = useState(false);
  const slideCount = artworkBanners.length;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on("select", onSelect);
    onSelect();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (slideCount < 2 || paused || reduceMotion) return () => void api.off("select", onSelect);
    const timer = window.setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => {
      window.clearInterval(timer);
      api.off("select", onSelect);
    };
  }, [api, slideCount, paused]);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/[0.07] via-background to-background">
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-secondary/10 blur-3xl" />

      <div className="container relative mx-auto max-w-6xl px-4 pb-8 pt-4 md:pb-12 md:pt-6">
        {slideCount === 0 ? (
          <TextHero banner={primaryBanner} />
        ) : (
          <>
            {/* The artwork carries the visible headline; keep a real h1 for SEO / screen readers. */}
            <h1 className="sr-only">{(primaryBanner?.title || "Ela Bazar").replace(/\n/g, " ")}</h1>
            {slideCount === 1 ? (
              <BannerArtwork banner={artworkBanners[0]} priority />
            ) : (
              <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                <Carousel setApi={setApi} opts={{ loop: true }} className="w-full">
                  <CarouselContent>
                    {artworkBanners.map((banner, index) => (
                      <CarouselItem key={banner.id}>
                        <BannerArtwork banner={banner} priority={index === 0} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-4 hidden h-10 w-10 border-0 bg-background/80 shadow-md backdrop-blur md:flex" />
                  <CarouselNext className="right-4 hidden h-10 w-10 border-0 bg-background/80 shadow-md backdrop-blur md:flex" />
                </Carousel>
                <div className="mt-4 flex justify-center gap-2">
                  {artworkBanners.map((banner, index) => (
                    <button
                      key={banner.id}
                      type="button"
                      onClick={() => api?.scrollTo(index)}
                      aria-label={`Show banner ${index + 1}`}
                      aria-current={index === selected}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === selected ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions + value strip */}
        <div className="mt-5 flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur md:mt-6 md:p-5 lg:flex-row lg:items-center lg:justify-between">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4 lg:flex-1">
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
          <div className="grid grid-cols-2 gap-3 lg:flex lg:shrink-0">
            <Button asChild size="lg" className="gap-2 rounded-xl font-semibold shadow-md">
              <Link to={ctaLink}>
                {ctaText}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 rounded-xl font-semibold">
              <Link to="/categories">
                <LayoutGrid className="h-4 w-4" />
                Categories
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
