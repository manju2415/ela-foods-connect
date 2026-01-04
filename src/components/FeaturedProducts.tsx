import ProductCard from "./ProductCard";
import productNamkeen from "@/assets/product-namkeen.jpg";
import productMixture from "@/assets/product-mixture.jpg";
import productChips from "@/assets/product-chips.jpg";
import productBhujia from "@/assets/product-bhujia.jpg";

const products = [
  {
    id: 1,
    name: "Classic Masala Namkeen",
    price: 149,
    originalPrice: 199,
    image: productNamkeen,
    category: "Namkeen",
    isNew: false,
    isBestSeller: true,
  },
  {
    id: 2,
    name: "Spicy Mumbai Mixture",
    price: 129,
    image: productMixture,
    category: "Mixture",
    isNew: true,
    isBestSeller: false,
  },
  {
    id: 3,
    name: "Crispy Potato Chips",
    price: 99,
    originalPrice: 120,
    image: productChips,
    category: "Chips",
    isNew: false,
    isBestSeller: true,
  },
  {
    id: 4,
    name: "Besan Bhujia Sev",
    price: 169,
    image: productBhujia,
    category: "Bhujia",
    isNew: true,
    isBestSeller: false,
  },
];

const FeaturedProducts = () => {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Our Collection
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Featured Products
          </h2>
          <p className="text-muted-foreground">
            Handpicked favorites loved by thousands of snack enthusiasts across the country
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} {...product} />
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center mt-12">
          <a
            href="/products"
            className="inline-flex items-center gap-2 text-primary font-semibold hover:text-primary/80 transition-colors"
          >
            View All Products
            <span className="text-lg">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
