import CategoryCard from "./CategoryCard";
import productNamkeen from "@/assets/product-namkeen.jpg";
import productMixture from "@/assets/product-mixture.jpg";
import productChips from "@/assets/product-chips.jpg";
import productBhujia from "@/assets/product-bhujia.jpg";

const categories = [
  { id: 1, name: "Namkeen", image: productNamkeen, productCount: 15 },
  { id: 2, name: "Mixture", image: productMixture, productCount: 12 },
  { id: 3, name: "Chips", image: productChips, productCount: 8 },
  { id: 4, name: "Bhujia & Sev", image: productBhujia, productCount: 10 },
];

const CategoriesSection = () => {
  return (
    <section className="py-16 md:py-24 bg-muted">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Browse By Category
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Shop by Category
          </h2>
          <p className="text-muted-foreground">
            Find your favorite snacks organized by type for easy shopping
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {categories.map((category) => (
            <CategoryCard key={category.id} {...category} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;
