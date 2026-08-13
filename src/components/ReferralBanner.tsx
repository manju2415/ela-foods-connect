import { Button } from "@/components/ui/button";
import { Gift, Wallet, Users } from "lucide-react";

const ReferralBanner = () => {
  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-secondary/20 via-background to-primary/10">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <span className="inline-flex items-center gap-2 bg-secondary/30 text-foreground rounded-full px-4 py-2 text-sm font-medium mb-6">
              <Gift className="h-4 w-4 text-primary" />
              Referral Program
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Refer Friends & <span className="text-primary">Earn Rewards</span>
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Share your love for Ela Bazar! Invite friends using your unique referral code 
              and earn wallet credits on every successful signup.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Button variant="hero" size="lg" asChild>
                <Link to="/signup">Become a Member</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/about">Learn More</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="flex gap-6 pt-6 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">₹100</p>
                  <p className="text-xs text-muted-foreground">Per Referral</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">5000+</p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual */}
          <div className="relative">
            <div className="bg-card rounded-3xl p-8 shadow-xl border border-border">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary/30 mb-4">
                  <Gift className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Your Wallet</h3>
              </div>
              
              <div className="bg-muted rounded-2xl p-6 mb-6">
                <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                <p className="text-4xl font-bold text-primary">₹500.00</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Referral Bonus</span>
                  <span className="text-sm font-medium text-green-600">+₹100</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Order Discount</span>
                  <span className="text-sm font-medium text-primary">-₹50</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Welcome Bonus</span>
                  <span className="text-sm font-medium text-green-600">+₹50</span>
                </div>
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-secondary/30 rounded-full blur-xl" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-primary/20 rounded-full blur-xl" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReferralBanner;
