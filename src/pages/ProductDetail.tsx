import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useUserRole } from "@/hooks/useUserRole";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductReviews from "@/components/ProductReviews";
import { TestimonialForm } from "@/components/TestimonialForm";
import { TestimonialsDisplay } from "@/components/TestimonialsDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OptimizedImage } from "@/components/ui/optimized-image";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ShoppingCart, Minus, Plus, ChevronLeft, ChevronRight, Package, Heart, Zap, Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buildVariantOptions, type GroupableProduct, type GroupableVariant } from "@/lib/variantOptions";
import { isNewArrival } from "@/utils/isNewArrival";


interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  price: number;
  compare_at_price: number | null;
  member_price: number | null;
  sku: string | null;
  stock_quantity: number;
  weight_grams: number | null;
  unit_type: string | null;
  unit_value: number | null;
  images: string[];
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_fast_selling: boolean;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart, buyNow } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { isMember } = useUserRole();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as Product | null;
    },
    enabled: !!slug,
  });

  const { data: category } = useQuery({
    queryKey: ["category", product?.category_id],
    queryFn: async () => {
      if (!product?.category_id) return null;
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug")
        .eq("id", product.category_id)
        .maybeSingle();
      if (error) throw error;
      return data as Category | null;
    },
    enabled: !!product?.category_id,
  });

  const { data: relatedProducts = [] } = useQuery({
    queryKey: ["related-products", product?.category_id, product?.id],
    queryFn: async () => {
      if (!product?.category_id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, compare_at_price, images")
        .eq("category_id", product.category_id)
        .eq("is_active", true)
        .neq("id", product.id)
        .limit(4);
      if (error) throw error;
      return data;
    },
    enabled: !!product?.category_id && !!product?.id,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ["product-variants", product?.id],
    queryFn: async () => {
      if (!product?.id) return [] as GroupableVariant[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as GroupableVariant[];
    },
    enabled: !!product?.id,
  });

  // Same-named products (admin adds different pack sizes as separate products)
  const { data: siblings = [] } = useQuery({
    queryKey: ["product-siblings", product?.id, product?.name],
    queryFn: async () => {
      if (!product?.id) return [] as GroupableProduct[];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, member_price, stock_quantity, unit_type, unit_value, category_id")
        .eq("name", product.name)
        .eq("is_active", true)
        .neq("id", product.id);
      if (error) throw error;
      return (data || []) as GroupableProduct[];
    },
    enabled: !!product?.id,
  });

  const { data: siblingVariants = [] } = useQuery({
    queryKey: ["sibling-variants", siblings.map((s) => s.id).join(",")],
    queryFn: async () => {
      if (siblings.length === 0) return [] as GroupableVariant[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, product_id, label, price, member_price, stock_quantity, is_default, display_order")
        .in("product_id", siblings.map((s) => s.id))
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as GroupableVariant[];
    },
    enabled: siblings.length > 0,
  });

  // Unified pack/quantity options: this product's variants + same-named products
  const options = product
    ? buildVariantOptions(
        [product, ...siblings],
        [...variants, ...siblingVariants]
      )
    : [];

  const defaultOption =
    options.find((o) => o.variantId && o.stock > 0 && variants.find((v) => v.id === o.variantId && v.is_default)) ||
    options.find((o) => o.stock > 0) ||
    options[0] ||
    null;
  const activeOption = options.find((o) => o.key === selectedOptionKey) || defaultOption;
  const effectivePrice = activeOption?.price ?? product?.price ?? 0;
  const effectiveStock = activeOption?.stock ?? product?.stock_quantity ?? 0;


  const handleAddToCart = async () => {
    if (!product) return;
    if (options.length > 1 && !activeOption) {
      toast.error("Please select a pack size");
      return;
    }
    if (quantity > effectiveStock) {
      toast.error(`Only ${effectiveStock} available`);
      return;
    }
    setIsAddingToCart(true);
    try {
      await addToCart(activeOption?.productId || product.id, quantity, activeOption?.variantId || null);
      toast.success(`${product.name}${activeOption ? ` (${activeOption.label})` : ""} added to cart`);
    } catch {
      toast.error("Failed to add to cart");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    if (options.length > 1 && !activeOption) {
      toast.error("Please select a pack size");
      return;
    }
    setIsBuyingNow(true);
    try {
      await buyNow(activeOption?.productId || product.id, quantity, activeOption?.variantId || null);
    } catch {
      toast.error("Failed to process. Please try again.");
    } finally {
      setIsBuyingNow(false);
    }
  };


  const nextImage = () => {
    if (product?.images?.length) {
      setSelectedImageIndex((prev) => (prev + 1) % product.images.length);
    }
  };

  const prevImage = () => {
    if (product?.images?.length) {
      setSelectedImageIndex((prev) => (prev - 1 + product.images.length) % product.images.length);
    }
  };

  // Auto-calculate member price if not set (10% discount)
  const basePrice = activeOption?.price ?? product?.price ?? 0;
  const effectiveMemberPrice = activeOption
    ? (activeOption.memberPrice ?? Math.round(activeOption.price * 0.9))
    : (product?.member_price ?? (product?.price ? Math.round(product.price * 0.9) : 0));

  // Calculate discount for compare_at_price (base product only)
  const discount = product?.compare_at_price && product?.price
    ? Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100)
    : 0;
  const memberDiscount = basePrice ? Math.round(((basePrice - effectiveMemberPrice) / basePrice) * 100) : 0;

  if (productLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="aspect-square rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-40" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Product Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The product you're looking for doesn't exist or has been removed.
          </p>
          <Button asChild>
            <Link to="/products">Browse Products</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const images = product.images?.length > 0 ? product.images : ["/placeholder.svg"];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <Breadcrumb className="mb-6">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/products">Products</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {category && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={`/products?category=${category.id}`}>{category.name}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{product.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            {/* Image Gallery */}
            <div className="space-y-4">
              <div className="relative mx-auto h-64 w-full max-w-md overflow-hidden rounded-lg bg-muted sm:h-72 md:h-[28rem]">
                <OptimizedImage
                  src={images[selectedImageIndex]}
                  alt={product.name}
                  className={`w-full h-full object-contain ${effectiveStock === 0 ? "grayscale opacity-50" : ""}`}
                  containerClassName="w-full h-full"
                  priority
                  displayWidth={448}
                  displayHeight={448}
                />
                {images.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={nextImage}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {discount > 0 && (
                  <Badge className="absolute top-4 left-4 bg-destructive">
                    {discount}% OFF
                  </Badge>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {images.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition-colors ${
                        index === selectedImageIndex
                          ? "border-primary"
                          : "border-transparent hover:border-muted-foreground"
                      }`}
                    >
                      <OptimizedImage src={img} alt="" className="w-full h-full object-cover" containerClassName="w-full h-full" displayWidth={80} displayHeight={80} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-6">
              <div>
                {category && (
                  <Link
                    to={`/products?category=${category.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {category.name}
                  </Link>
                )}
                <h1 className="text-3xl font-bold mt-1">{product.name}</h1>
                {(isNewArrival(product.created_at) || product.is_fast_selling) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {isNewArrival(product.created_at) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        <Sparkles className="h-3 w-3" />
                        New Arrival
                      </span>
                    )}
                    {product.is_fast_selling && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                        <Flame className="h-3 w-3" />
                        Fast Selling
                      </span>
                    )}
                  </div>
                )}
                {product.sku && (
                  <p className="text-sm text-muted-foreground mt-1">SKU: {product.sku}</p>
                )}
              </div>

              <div className="space-y-3">
                {/* MRP Price */}
                <div className="flex items-baseline gap-3">
                  <span className={`font-bold ${isMember ? 'text-xl text-muted-foreground line-through' : 'text-3xl'}`}>
                    MRP: ₹{Number(basePrice).toFixed(2)}
                  </span>
                  {product.compare_at_price && product.compare_at_price > product.price && (
                    <span className="text-lg text-muted-foreground line-through">
                      MRP: ₹{Number(product.compare_at_price).toFixed(2)}
                    </span>
                  )}
                  {discount > 0 && (
                    <Badge variant="secondary">{discount}% OFF</Badge>
                  )}
                </div>
                {/* Member Price - Always shown */}
                <div className="flex items-baseline gap-3 p-3 bg-green-200 dark:bg-green-900/70 rounded-lg border border-green-400 dark:border-green-700 shadow-sm">
                  <span className={`font-bold ${isMember ? 'text-3xl text-green-600' : 'text-2xl text-green-600'}`}>
                    Member Price: ₹{Number(effectiveMemberPrice).toFixed(2)}
                  </span>
                  {memberDiscount > 0 && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      {memberDiscount}% OFF
                    </Badge>
                  )}
                  {isMember ? (
                    <Badge className="bg-green-600 text-white">Your Price</Badge>
                  ) : (
                    <span className="text-sm text-green-600">Become a member to save!</span>
                  )}
                </div>
              </div>

              {product.short_description && (
                <p className="text-muted-foreground">{product.short_description}</p>
              )}

              {options.length > 1 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Choose pack size:</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pack size">
                    {options.map((option) => {
                      const isSelected = activeOption?.key === option.key;
                      const outOfStock = option.stock <= 0;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={outOfStock}
                          onClick={() => {
                            setSelectedOptionKey(option.key);
                            setQuantity(1);
                          }}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : outOfStock
                                ? "cursor-not-allowed border-muted bg-muted text-muted-foreground opacity-60 line-through"
                                : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {option.label}
                          <span className="ml-1 no-underline">
                            {outOfStock ? "(Out of stock)" : `(${option.stock} available)`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-md">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center font-medium">{quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuantity(Math.min(effectiveStock, quantity + 1))}
                      disabled={quantity >= effectiveStock}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => toggleWishlist(product.id)}
                    className={isInWishlist(product.id) ? "text-destructive border-destructive hover:bg-destructive/10" : ""}
                  >
                    <Heart className={`h-5 w-5 ${isInWishlist(product.id) ? "fill-current" : ""}`} />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleAddToCart}
                    disabled={isAddingToCart || effectiveStock === 0}
                    className="flex-1"
                  >
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    {effectiveStock === 0 ? "Out of Stock" : "Add to Cart"}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="secondary"
                    onClick={handleBuyNow}
                    disabled={isBuyingNow || effectiveStock === 0}
                    className="flex-1"
                  >
                    <Zap className="mr-2 h-5 w-5" />
                    Buy Now
                  </Button>
                </div>
              </div>

              {effectiveStock > 0 && effectiveStock <= 10 && (
                <p className="text-sm text-destructive">
                  Only {effectiveStock} left in stock!
                </p>
              )}

              {product.description && (
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground whitespace-pre-line">{product.description}</p>
                </div>
              )}

              {product.weight_grams && (
                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-2">Product Details</h3>
                  <p className="text-sm text-muted-foreground">
                    Weight: {product.weight_grams}g
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <div className="mt-16">
              <h2 className="text-2xl font-bold mb-6">Related Products</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {relatedProducts.map((relatedProduct) => (
                  <Link
                    key={relatedProduct.id}
                    to={`/product/${relatedProduct.slug}`}
                    className="group"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-2">
                      <OptimizedImage
                        src={relatedProduct.images?.[0] || "/placeholder.svg"}
                        alt={relatedProduct.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        containerClassName="w-full h-full"
                        displayWidth={300}
                        displayHeight={300}
                      />
                    </div>
                    <h3 className="font-medium group-hover:text-primary transition-colors line-clamp-2">
                      {relatedProduct.name}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold">MRP: ₹{Number(relatedProduct.price).toFixed(2)}</span>
                      {relatedProduct.compare_at_price && (
                        <span className="text-sm text-muted-foreground line-through">
                          MRP: ₹{Number(relatedProduct.compare_at_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Testimonials Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Customer Testimonials</h2>
              <TestimonialForm productId={product.id} productName={product.name} />
            </div>
            <TestimonialsDisplay productId={product.id} />
          </div>

          {/* Product Reviews */}
          <ProductReviews productId={product.id} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
