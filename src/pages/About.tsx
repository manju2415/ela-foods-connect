import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  ShoppingBasket,
  Tag,
  Users,
  Truck,
  Mail,
  Wallet,
  Gift,
  Award,
} from "lucide-react";

const HOW_IT_WORKS = [
  { icon: ShoppingBasket, text: "Community buying ecommerce for monthly essential groceries" },
  { icon: Tag, text: "Wholesale price, so it's discounted vs retail" },
  { icon: Users, text: "Only registered Members" },
  { icon: Truck, text: "Delivered directly to your home" },
  { icon: Mail, text: "Registration by Invitation only. You can join only if an existing member invites you." },
];

const REFERRAL_SLABS = [
  { range: "1st to 10th Friend", points: "400 Points Each" },
  { range: "11th Friend onwards", points: "200 Points Each" },
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
              You're Cordially Invited
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              to join the exclusive Ela Bazar community
            </p>
            <p className="text-muted-foreground max-w-2xl mx-auto mt-4">
              So basically it's like a private wholesale grocery club.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
                Ela Bazar – How It Works
              </h2>
              <div className="space-y-4">
                {HOW_IT_WORKS.map((item, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-muted/40">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-muted-foreground pt-2">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Membership Fee Breakdown */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-foreground mb-4">How Ela Bazar Works</h2>
              <p className="text-muted-foreground mb-10">
                Your membership starts with a one-time payment of{" "}
                <span className="text-primary font-semibold">₹3,999</span>.
              </p>

              <div className="grid sm:grid-cols-2 gap-6 mb-10">
                <Card className="border-none shadow-lg">
                  <CardContent className="pt-8 pb-6 text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Award className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">₹999</p>
                    <p className="text-sm text-muted-foreground">
                      One-time Registration & Platform Maintenance Fee
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-lg">
                  <CardContent className="pt-8 pb-6 text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Wallet className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">₹3,000</p>
                    <p className="text-sm text-muted-foreground">
                      Credited instantly to your Elabazar Wallet for shopping
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3 text-muted-foreground">
                <p>
                  We use the registration pool to negotiate wholesale rates directly with brands.
                  That means <span className="text-primary font-semibold">1% to 25% off</span> on
                  every product, every month.
                </p>
                <p>
                  Most members recover their ₹999 registration fee within 30 days through savings
                  alone. Pay once. Save forever. Delivered home.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Refer & Earn Program */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-foreground mb-4 text-center">
                Ela Bazar Refer & Earn Program
              </h2>
              <p className="text-muted-foreground text-center mb-10">
                Ela Bazar is an exclusive, invitation-only community. Membership is granted only
                upon invitation and payment of the membership fee. To appreciate our members and
                encourage community growth, we've launched the Elabazar Reward Points System.
              </p>

              <div className="grid sm:grid-cols-3 gap-6 mb-10">
                <Card className="text-center border-none shadow-lg">
                  <CardContent className="pt-8 pb-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Gift className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">How You Earn</h3>
                    <p className="text-sm text-muted-foreground">
                      First 10 Successful Referrals: Earn 400 Reward Points for each
                    </p>
                  </CardContent>
                </Card>
                <Card className="text-center border-none shadow-lg">
                  <CardContent className="pt-8 pb-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">Every Referral After 10</h3>
                    <p className="text-sm text-muted-foreground">
                      Earn 200 Reward Points for each
                    </p>
                  </CardContent>
                </Card>
                <Card className="text-center border-none shadow-lg">
                  <CardContent className="pt-8 pb-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Wallet className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">100% Redeemable</h3>
                    <p className="text-sm text-muted-foreground">
                      Use all points directly on your future grocery purchases
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="max-w-md mx-auto mb-8">
                <h3 className="font-semibold text-foreground mb-3 text-center">
                  Direct Referral Earning Slab
                </h3>
                <div className="rounded-xl border border-border overflow-hidden">
                  {REFERRAL_SLABS.map((slab, i) => (
                    <div
                      key={slab.range}
                      className={`flex justify-between items-center px-5 py-3 ${
                        i % 2 === 0 ? "bg-muted/40" : "bg-background"
                      }`}
                    >
                      <span className="text-muted-foreground">{slab.range}</span>
                      <span className="font-semibold text-foreground">{slab.points}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-center text-muted-foreground">
                Example: Invite 15 friends = 4000 + 1000 = 5000 Points. All points are directly
                redeemable on your monthly grocery orders.
              </p>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <p className="max-w-2xl mx-auto text-primary-foreground/90 mb-2">
              Ela Bazar is more than a platform. It's a members-only community where we buy
              together, save together, and grow together.
            </p>
            <h2 className="text-2xl md:text-3xl font-bold mb-8">
              Get invited today and unlock lifelong discounts.
            </h2>
            <Button variant="secondary" size="lg" asChild>
              <Link to="/signup">Become a Member</Link>
            </Button>
            <p className="text-sm text-primary-foreground/70 mt-8">
              Buy together • Save together • Grow together
            </p>
            <p className="text-xs text-primary-foreground/60 mt-6 max-w-2xl mx-auto">
              * Referral reward benefits are only for promotional purpose. Subject to change
              without any prior notice. Elabazar management reserves the right to withdraw or
              modify such offers from time to time.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
