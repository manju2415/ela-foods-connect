import { Truck, Shield, Award, Heart, RefreshCw, Headphones } from "lucide-react";

const features = [
  {
    icon: Award,
    title: "Premium Quality",
    description: "Carefully curated products from trusted brands",
  },
  {
    icon: Truck,
    title: "Fast Delivery",
    description: "Quick doorstep delivery across all major cities",
  },
  {
    icon: Shield,
    title: "Verified Sellers",
    description: "Quality checked products from verified sellers",
  },
  {
    icon: Heart,
    title: "Best Prices",
    description: "Competitive pricing on all products",
  },
  {
    icon: RefreshCw,
    title: "Easy Returns",
    description: "Hassle-free return and refund policy",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    description: "Always here to help with your queries",
  },
];

const WhyChooseUs = () => {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Why Ela Bazar
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Why Choose Us
          </h2>
          <p className="text-muted-foreground">
            We're committed to bringing you the best snacking experience
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group text-center p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyChooseUs;
