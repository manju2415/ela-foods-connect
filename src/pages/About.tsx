import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Tag, Leaf, ShieldCheck, Target, Mail } from "lucide-react";

const DIFFERENCES = [
  {
    icon: Tag,
    title: "Real Wholesale Prices",
    text: "Join the ElaBazar Community and buy your Toor Dal, Rice, Wheat Flour, Spices, Oils and daily essentials at the price shops buy. The more we grow together, the cheaper it gets for everyone.",
  },
  {
    icon: Leaf,
    title: "Unpacked & Honest Groceries",
    text: "We believe in seeing what you buy. Most of our staples come unpacked and fresh — Toor Dal, Moong Dal, Matta Rice, Turmeric, Coconut and more — sourced directly from local farmers and mills in various parts of India. Fresh. Local. Quality Guaranteed.",
  },
  {
    icon: ShieldCheck,
    title: "Fresh • Local • Quality Guaranteed",
    text: "Every batch is checked for quality. From the farm to your kitchen, we keep it natural and affordable.",
  },
];

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-primary/10 via-secondary/5 to-background py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              About Us
            </h1>
            <p className="text-lg font-semibold text-foreground max-w-2xl mx-auto">
              ElaBazar - Your Community Wholesale Grocery Store
            </p>
            <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
              ElaBazar was born from a simple idea: Why should daily groceries cost more when
              bought in small packs?
            </p>
            <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
              We bring the wholesale market to your doorstep. No middlemen, no fancy packaging
              markups — just fresh, quality groceries at true wholesale prices.
            </p>
          </div>
        </section>

        {/* What makes us different */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-foreground mb-4 text-center">
                What makes us different?
              </h2>
              <p className="text-muted-foreground text-center mb-10">
                We are not just another grocery app. We are a community.
              </p>
              <div className="space-y-6">
                {DIFFERENCES.map((item) => (
                  <Card key={item.title} className="border-none shadow-lg">
                    <CardContent className="flex items-start gap-4 p-6">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <item.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                        <p className="text-muted-foreground">{item.text}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Our Mission */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Our Mission</h2>
              <p className="text-muted-foreground">
                To make everyday cooking affordable for every family in Bangalore and beyond, by
                building India's largest community-driven wholesale grocery network.
              </p>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              Welcome to the ElaBazar Community
            </h2>
            <p className="max-w-2xl mx-auto text-primary-foreground/90 mb-8">
              Buy at Wholesale Price. Live Better for Less.
            </p>
            <Button variant="secondary" size="lg" asChild>
              <Link to="/products">Shop Now</Link>
            </Button>
            <p className="text-sm text-primary-foreground/80 mt-8 flex items-center justify-center gap-2 flex-wrap">
              <Mail className="h-4 w-4" />
              Feel free to drop us your suggestions and comments to{" "}
              <a href="mailto:info@elafoods.in" className="font-semibold underline">
                info@elafoods.in
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
