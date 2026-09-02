import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CategoriesSection from "@/components/CategoriesSection";

/**
 * Dedicated category-browsing landing page for the "Categories" nav link —
 * shows the category grid only. Picking a category drills into its
 * subcategories (or straight to products for a leaf category) on /category/:slug.
 */
const ShopByCategory = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <CategoriesSection />
      </main>
      <Footer />
    </div>
  );
};

export default ShopByCategory;
