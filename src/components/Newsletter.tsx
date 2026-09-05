import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const Newsletter = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("newsletter_subscribers").insert({ email: trimmed });
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        toast.success("You're already subscribed!");
        setEmail("");
        return;
      }
      toast.error("Could not subscribe. Please try again.");
      return;
    }

    toast.success("Subscribed! Watch your inbox for offers and updates.");
    setEmail("");
  };

  return (
    <section className="py-16 md:py-20 bg-primary">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Join the Ela Bazar Family
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            Subscribe to get exclusive offers, new arrivals, and special deals delivered to your inbox.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/50 focus:border-secondary"
            />
            <Button type="submit" variant="warm" size="lg" className="gap-2 shrink-0" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Subscribe
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
