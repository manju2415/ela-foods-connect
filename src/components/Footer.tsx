import * as React from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from "lucide-react";
import elaLogo from "@/assets/ela-foods-logo.png";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { supabase } from "@/integrations/supabase/client";

interface FooterCategory {
  name: string;
  slug: string;
}

const Footer = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    const { storeSettings } = useStoreSettings();
    const [categories, setCategories] = React.useState<FooterCategory[]>([]);

    React.useEffect(() => {
      supabase
        .from("categories")
        .select("name, slug")
        .eq("is_active", true)
        .is("parent_id", null)
        .order("display_order")
        .limit(6)
        .then(({ data }) => setCategories(data || []));
    }, []);

    return (
      <footer ref={ref} className={`bg-foreground text-card ${className || ""}`} {...props}>
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="space-y-4">
              <img src={elaLogo} alt={storeSettings.store_name} className="h-20 w-auto brightness-110" />
              <p className="text-card/70 text-sm leading-relaxed">
                Your one-stop destination for quality products across categories. 
                Shop from a wide range of products delivered to your doorstep.
              </p>
              <div className="flex gap-4">
                <a href="#" className="text-card/60 hover:text-secondary transition-colors">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="#" className="text-card/60 hover:text-secondary transition-colors">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="#" className="text-card/60 hover:text-secondary transition-colors">
                  <Twitter className="h-5 w-5" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold text-lg mb-4 text-secondary">Quick Links</h4>
              <ul className="space-y-2">
                {[
                  { name: "Home", href: "/" },
                  { name: "Products", href: "/products" },
                  { name: "Categories", href: "/categories" },
                  { name: "About Us", href: "/about" },
                  { name: "Contact", href: "/contact" },
                ].map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-card/70 hover:text-secondary text-sm transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Categories */}
            <div>
              <h4 className="font-semibold text-lg mb-4 text-secondary">Categories</h4>
              <ul className="space-y-2">
                {categories.map((cat) => (
                  <li key={cat.slug}>
                    <Link to={`/category/${cat.slug}`} className="text-card/70 hover:text-secondary text-sm transition-colors">
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-lg mb-4 text-secondary">Contact Us</h4>
              <ul className="space-y-3">
                {storeSettings.store_address && (
                  <li className="flex items-start gap-3 text-sm text-card/70">
                    <MapPin className="h-5 w-5 shrink-0 text-secondary" />
                    <span>{storeSettings.store_address}</span>
                  </li>
                )}
                {storeSettings.store_phone && (
                  <li className="flex items-center gap-3 text-sm text-card/70">
                    <Phone className="h-5 w-5 shrink-0 text-secondary" />
                    <span>{storeSettings.store_phone}</span>
                  </li>
                )}
                {storeSettings.store_email && (
                  <li className="flex items-center gap-3 text-sm text-card/70">
                    <Mail className="h-5 w-5 shrink-0 text-secondary" />
                    <span>{storeSettings.store_email}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="border-t border-card/20 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-card/60 text-sm">
              © 2026 {storeSettings.store_name}. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm flex-wrap">
              <Link to="/policies/return" className="text-card/60 hover:text-secondary transition-colors">
                Return Policy
              </Link>
              <Link to="/policies/cancellation" className="text-card/60 hover:text-secondary transition-colors">
                Cancellation Policy
              </Link>
              <Link to="/policies/refund" className="text-card/60 hover:text-secondary transition-colors">
                Refund Policy
              </Link>
              <Link to="/terms-and-conditions" className="text-card/60 hover:text-secondary transition-colors">
                Terms & Conditions
              </Link>
              <Link to="/user-agreement" className="text-card/60 hover:text-secondary transition-colors">
                User Agreement
              </Link>

              <Link to="/account-deletion" className="text-card/60 hover:text-secondary transition-colors">
                Delete Account
              </Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }
);

Footer.displayName = "Footer";

export default Footer;