import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Shield, Sparkles, Users } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-primary/10 via-secondary/5 to-background py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Your Trusted Marketplace
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Bringing quality products from trusted sellers to your doorstep
            </p>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-foreground mb-8 text-center">Our Story</h2>
              <div className="space-y-6 text-muted-foreground leading-relaxed">
                <p>
                  Ela Bazar was founded with a simple mission — to create a seamless online shopping 
                  experience that connects customers with <span className="text-primary font-semibold">quality products</span> across 
                  every category.
                </p>
                <p>
                  From humble beginnings, Ela Bazar has grown into a thriving e-commerce platform 
                  offering thousands of products across electronics, fashion, home essentials, 
                  groceries, beauty, sports, and much more.
                </p>
                <p>
                  We partner with verified sellers and trusted brands to ensure every product 
                  on our platform meets the highest standards of quality. Our dedicated logistics 
                  network ensures fast and reliable delivery to your doorstep.
                </p>
                <p>
                  With a customer-first approach and a commitment to competitive pricing, 
                  Ela Bazar has earned the trust of thousands of happy shoppers. Our growth 
                  is a testament to the loyalty our customers place in us.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Promise Section */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-foreground mb-12 text-center">The Ela Bazar Promise</h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <Card className="text-center border-none shadow-lg">
                <CardContent className="pt-8 pb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">Quality</h3>
                  <p className="text-muted-foreground text-sm">
                    Carefully curated products from verified sellers and trusted brands
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center border-none shadow-lg">
                <CardContent className="pt-8 pb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">Trust</h3>
                  <p className="text-muted-foreground text-sm">
                    Built on the love and loyalty of our customers
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center border-none shadow-lg">
                <CardContent className="pt-8 pb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">Value</h3>
                  <p className="text-muted-foreground text-sm">
                    Competitive pricing and exclusive deals across all categories
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">1000+</div>
                <div className="text-primary-foreground/80">Products</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">500+</div>
                <div className="text-primary-foreground/80">Verified Sellers</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">10K+</div>
                <div className="text-primary-foreground/80">Happy Customers</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">50+</div>
                <div className="text-primary-foreground/80">Categories</div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
