import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

const Newsletter = () => {
  return (
    <section className="py-16 md:py-20 bg-primary">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Join Our Snack Family
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            Subscribe to get exclusive offers, new product alerts, and delicious recipes delivered to your inbox.
          </p>

          <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Enter your email"
              className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/50 focus:border-secondary"
            />
            <Button variant="warm" size="lg" className="gap-2 shrink-0">
              Subscribe
              <Send className="h-4 w-4" />
            </Button>
          </form>

          <p className="text-primary-foreground/60 text-xs mt-4">
            By subscribing, you agree to our Privacy Policy and consent to receive updates.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Newsletter;
