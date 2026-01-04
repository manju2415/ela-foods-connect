import { Button } from "@/components/ui/button";
import { ArrowRight, Star } from "lucide-react";
import heroImage from "@/assets/hero-snacks.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Delicious snacks"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/30" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-secondary/20 backdrop-blur-sm border border-secondary/30 rounded-full px-4 py-2 mb-6">
            <Star className="h-4 w-4 text-secondary fill-secondary" />
            <span className="text-sm text-card font-medium">Premium Quality Snacks</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-card leading-tight mb-6">
            Experience the
            <span className="block text-secondary mt-2">Mother's Touch</span>
          </h1>

          <p className="text-lg md:text-xl text-card/80 mb-8 leading-relaxed">
            Discover authentic homemade snacks crafted with love and traditional recipes. 
            From crispy namkeen to spicy mixtures, taste the difference that quality makes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="hero" size="xl" className="gap-2">
              Shop Now
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Button variant="heroOutline" size="xl">
              Explore Categories
            </Button>
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
