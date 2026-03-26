import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { ArrowRight, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useImagePreload } from "@/hooks/useImagePreload";
import heroImageFallback from "@/assets/hero-snacks.jpg";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  cta_link: string | null;
  image_url: string | null;
  badge_text: string | null;
}

const HeroSection = () => {
  const { data: banner } = useQuery({
    queryKey: ["hero-banner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .eq("location", "home_hero")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as Banner | null;
    },
  });

  // Default values if no banner is set
  const title = banner?.title || "Shop Everything You Love";
  const subtitle = banner?.subtitle || "Your one-stop destination for quality products across all categories. From electronics to fashion, home essentials to groceries — discover great deals every day.";
  const ctaText = banner?.cta_text || "Shop Now";
  const ctaLink = banner?.cta_link || "/products";
  const badgeText = banner?.badge_text || "Your Trusted Marketplace";
  const heroImage = banner?.image_url || heroImageFallback;

  // Preload hero image for better LCP
  useImagePreload([heroImage]);

  // Split title by newline or use as is
  const titleParts = title.split('\n');
  const mainTitle = titleParts[0];
  const highlightTitle = titleParts[1] || null;

  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <OptimizedImage
          src={heroImage}
          alt="Hero banner"
          className="w-full h-full object-cover"
          containerClassName="w-full h-full"
          priority
          blur={false}
          displayWidth={1920}
          displayHeight={1080}
          quality="high"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/30" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl">
          {/* Badge */}
          {badgeText && (
            <div className="inline-flex items-center gap-2 bg-secondary/20 backdrop-blur-sm border border-secondary/30 rounded-full px-4 py-2 mb-6">
              <Star className="h-4 w-4 text-secondary fill-secondary" />
              <span className="text-sm text-card font-medium">{badgeText}</span>
            </div>
          )}

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-card leading-tight mb-6">
            {mainTitle}
            {highlightTitle && (
              <span className="block text-secondary mt-2">{highlightTitle}</span>
            )}
          </h1>

          <p className="text-lg md:text-xl text-card/80 mb-8 leading-relaxed">
            {subtitle}
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link to={ctaLink}>
              <Button variant="hero" size="xl" className="gap-2">
                {ctaText}
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/products">
              <Button variant="heroOutline" size="xl">
                Explore Categories
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="flex gap-8 mt-12 pt-8 border-t border-card/20">
            <div>
              <p className="text-3xl font-bold text-secondary">50+</p>
              <p className="text-card/70 text-sm">Products</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-secondary">10K+</p>
              <p className="text-card/70 text-sm">Happy Customers</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-secondary">100%</p>
              <p className="text-card/70 text-sm">Quality Assured</p>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Element */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
