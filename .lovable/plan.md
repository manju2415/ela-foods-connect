

# Rebrand Website Content: ELA Foods (Snacks) → Ela Bazar (General E-commerce)

## Summary
Update all snack-specific and "ELA Foods" branded content across the website to reflect **Ela Bazar** as a full e-commerce platform with diverse product categories.

## Files to Update

### 1. `index.html` — SEO & Meta Tags
- Title: "Ela Bazar - Your One-Stop Online Shopping Destination"
- Description: general e-commerce description
- Keywords: remove snack-specific terms, add general e-commerce keywords
- `apple-mobile-web-app-title`: "Ela Bazar"
- OG/Twitter tags: update accordingly
- Twitter site: "@ElaBazar"

### 2. `src/components/HeroSection.tsx` — Default Hero Content
- Title: "Shop Everything You Love" (instead of "Experience the Mother's Touch")
- Subtitle: general shopping description instead of snacks
- Badge: "Your Trusted Marketplace" instead of "Premium Quality Snacks"
- Stats: keep 50+ Products, 10K+ Happy Customers, 100% Quality Assured

### 3. `src/components/Footer.tsx`
- Description: "Your one-stop destination for quality products across categories. Shop from a wide range of products delivered to your doorstep." instead of snack text

### 4. `src/components/WhyChooseUs.tsx`
- Section label: "Why Ela Bazar" instead of "Why ELA Foods"
- Subtitle: "We're committed to bringing you the best shopping experience"
- Update feature descriptions to be generic (remove "snack", "mother's touch", "FSSAI")
  - "Premium Quality" → "Carefully curated products from trusted brands"
  - "100% Hygienic" → "Verified Sellers" / "Quality checked products from verified sellers"
  - "Made with Love" → "Best Prices" / "Competitive pricing on all products"

### 5. `src/components/Newsletter.tsx`
- Heading: "Join the Ela Bazar Family" instead of "Join Our Snack Family"
- Subtitle: "Subscribe to get exclusive offers, new arrivals, and special deals delivered to your inbox."

### 6. `src/components/ReferralBanner.tsx`
- "Share your love for ELA Foods!" → "Share your love for Ela Bazar!"

### 7. `src/components/FeaturedProducts.tsx`
- Subtitle: "Top picks loved by thousands of shoppers across the country" instead of "snack enthusiasts"
- Default category fallback: "General" instead of "Snacks"

### 8. `src/pages/About.tsx`
- Rewrite to reflect Ela Bazar as a general e-commerce marketplace
- Update story, stats, and promise sections to be product-agnostic

### 9. `src/pages/Contact.tsx`
- Subtitle: remove "chefs" / food-specific language, make it generic marketplace

### 10. `src/pages/Products.tsx`
- "Discover our wide range of authentic Indian snacks" → "Discover our wide range of quality products"
- Default category: "General" instead of "Snacks"

### 11. `src/pages/Auth.tsx`
- No snack-specific text expected, but verify login page text

### 12. PWA Manifests
- `public/manifest-customer.json`: name "Ela Bazar", description "Shop quality products on Ela Bazar"
- `public/manifest-driver.json`: name "Ela Bazar Delivery", description "Deliver orders with Ela Bazar"
- `public/manifest-member.json`: name "Ela Bazar Network", description "Grow your network with Ela Bazar"

### 13. Install Pages
- `src/pages/install/CustomerInstall.tsx`: "Ela Bazar" + "Your one-stop online store", features updated (not snack-specific)
- `src/pages/install/DriverInstall.tsx`: "Ela Bazar Delivery" + "Deliver with Ela Bazar"
- `src/pages/install/MemberInstall.tsx`: "Ela Bazar Network" + "Grow your network with Ela Bazar"

### 14. App Pages
- `src/pages/CustomerApp.tsx`: "Ela Bazar" instead of "ELA Foods", remove "Delicious snacks delivered"
- `src/pages/DriverApp.tsx`: "Ela Bazar Delivery" instead of "ELA Delivery"
- `src/pages/MemberApp.tsx`: "Ela Bazar Network" instead of "ELA Network"
- `src/pages/MobileApps.tsx`: "Ela Bazar Apps"

### 15. Admin/MLM Layouts
- `src/components/admin/AdminLayout.tsx`: "Ela Bazar Admin"
- `src/components/mlm-admin/MLMAdminLayout.tsx`: "Ela Bazar Network Manager"

### 16. Other Pages
- `src/pages/RegistrationPayment.tsx`: "Ela Bazar member" instead of "ELA Foods member", notification message updated
- `src/pages/CompleteRegistration.tsx`: "Ela Bazar membership"
- `src/pages/Policies.tsx`: "Ela Bazar wallet" in fallback policy text
- `src/pages/admin/Settings.tsx`: default store_name "Ela Bazar", email "contact@elabazar.com"
- `src/pages/admin/Banners.tsx`: placeholder text updates

### 17. `src/pages/admin/Categories.tsx` (Footer)
- Footer categories list: Replace "Namkeen, Chips, Mixture, Bhujia, Sweets, Combos" with generic categories like "Electronics, Fashion, Home & Kitchen, Beauty, Sports, Groceries"

## Approach
- Bulk find-and-replace "ELA Foods" → "Ela Bazar" across all files
- Replace snack-specific descriptions with general e-commerce language
- Keep the same visual design, layout, and component structure — only text content changes

