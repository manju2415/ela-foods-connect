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
              The Real Taste of India
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Bringing authentic homemade flavors to your doorstep since 2019
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
                  In August 2019, four pioneers in diverse fields joined hands to pursue something they 
                  are most passionate about – <span className="text-primary font-semibold">Food</span>.
                </p>
                <p>
                  From humble beginnings, in a compact room with only one packaging machine in 2019, 
                  Ela Foods and Snacks Pvt Ltd has grown into a thriving enterprise with over 30 products 
                  and more than 1000 shops to supply in Bangalore, within a very brief span of time.
                </p>
                <p>
                  We house world-class manufacturing facilities and intricate distribution networks in 
                  the city of Bangalore. Our start was just 500 packets per day but, due to the love 
                  we received from our customers, today we pack around 5000 packets a day!
                </p>
                <p>
                  Uncompromising quality and prompt distribution have made us the favourite among snack 
                  manufacturers for retail networks. The retailers and consumers always have access to 
                  our customer service team and field staff. Our growth from manufacturing 100 packets 
                  in a day to as much as 5000 packets, stands true to this trust our customers place in us.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Promise Section */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-foreground mb-12 text-center">The ELA Promise</h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <Card className="text-center border-none shadow-lg">
                <CardContent className="pt-8 pb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">Quality</h3>
                  <p className="text-muted-foreground text-sm">
                    Uncompromising standards in every product we create
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
                  <h3 className="text-xl font-semibold text-foreground mb-2">Hygiene</h3>
                  <p className="text-muted-foreground text-sm">
                    World-class manufacturing facilities ensuring purity
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
                <div className="text-4xl md:text-5xl font-bold mb-2">30+</div>
                <div className="text-primary-foreground/80">Products</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">1000+</div>
                <div className="text-primary-foreground/80">Retail Shops</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">5000</div>
                <div className="text-primary-foreground/80">Packets/Day</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold mb-2">2019</div>
                <div className="text-primary-foreground/80">Founded</div>
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
