import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from "lucide-react";
import elaLogo from "@/assets/ela-foods-logo.png";

const Footer = () => {
  return (
    <footer className="bg-foreground text-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <img src={elaLogo} alt="ELA Foods" className="h-20 w-auto brightness-110" />
            <p className="text-card/70 text-sm leading-relaxed">
              Bringing the authentic taste of homemade snacks to your doorstep. 
              Made with love, just like mother's touch.
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
              {["Home", "Products", "Categories", "About Us", "Contact"].map((link) => (
                <li key={link}>
                  <Link to="#" className="text-card/70 hover:text-secondary text-sm transition-colors">
                    {link}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-secondary">Categories</h4>
            <ul className="space-y-2">
              {["Namkeen", "Chips", "Mixture", "Bhujia", "Sweets", "Combos"].map((cat) => (
                <li key={cat}>
                  <Link to="#" className="text-card/70 hover:text-secondary text-sm transition-colors">
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-secondary">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm text-card/70">
                <MapPin className="h-5 w-5 shrink-0 text-secondary" />
                <span>123 Snack Street, Food City, FC 12345</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-card/70">
                <Phone className="h-5 w-5 shrink-0 text-secondary" />
                <span>+91 98765 43210</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-card/70">
                <Mail className="h-5 w-5 shrink-0 text-secondary" />
                <span>hello@elafoods.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-card/20 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-card/60 text-sm">
            © 2026 ELA Foods. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            <Link to="#" className="text-card/60 hover:text-secondary transition-colors">
              Privacy Policy
            </Link>
            <Link to="#" className="text-card/60 hover:text-secondary transition-colors">
              Terms of Service
            </Link>
            <Link to="#" className="text-card/60 hover:text-secondary transition-colors">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
