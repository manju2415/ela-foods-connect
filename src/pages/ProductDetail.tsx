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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ShoppingCart, Minus, Plus, ChevronLeft, ChevronRight, Package, Heart } from "lucide-react";
import { toast } from "sonner";

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
  images: string[];
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { isMember } = useUserRole();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

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

  const handleAddToCart = async () => {
    if (!product) return;
    setIsAddingToCart(true);
    try {
      await addToCart(product.id, quantity);
      toast.success(`${product.name} added to cart`);
    } catch {
      toast.error("Failed to add to cart");
    } finally {
      setIsAddingToCart(false);
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

  // Calculate display price and discount based on membership
  const displayPrice = isMember && product?.member_price ? product.member_price : product?.price || 0;
  const strikethroughPrice = isMember && product?.member_price ? product?.price : product?.compare_at_price;
  const discount = strikethroughPrice && product
    ? Math.round(((strikethroughPrice - displayPrice) / strikethroughPrice) * 100)
    : 0;

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
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <img
                  src={images[selectedImageIndex]}
                  alt={product.name}
                  className="w-full h-full object-cover"
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
                      <img src={img} alt="" className="w-full h-full object-cover" />
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
                {product.sku && (
                  <p className="text-sm text-muted-foreground mt-1">SKU: {product.sku}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">₹{Number(displayPrice).toFixed(2)}</span>
                  {strikethroughPrice && strikethroughPrice > displayPrice && (
                    <span className="text-xl text-muted-foreground line-through">
                      ₹{Number(strikethroughPrice).toFixed(2)}
                    </span>
                  )}
                  {isMember && product.member_price && (
                    <Badge className="bg-green-600 text-white">Member Price</Badge>
                  )}
                </div>
                {!isMember && product.member_price && (
                  <p className="text-sm text-green-600">
                    Member price: ₹{Number(product.member_price).toFixed(2)} — Sign up to save!
                  </p>
                )}
              </div>

              {product.short_description && (
                <p className="text-muted-foreground">{product.short_description}</p>
              )}

              <div className="flex items-center gap-4">
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
                    onClick={() => setQuantity(Math.min(product.stock_quantity, quantity + 1))}
                    disabled={quantity >= product.stock_quantity}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  size="lg"
                  onClick={handleAddToCart}
                  disabled={isAddingToCart || product.stock_quantity === 0}
                  className="flex-1"
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  {product.stock_quantity === 0 ? "Out of Stock" : "Add to Cart"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => toggleWishlist(product.id)}
                  className={isInWishlist(product.id) ? "text-destructive border-destructive hover:bg-destructive/10" : ""}
                >
                  <Heart className={`h-5 w-5 ${isInWishlist(product.id) ? "fill-current" : ""}`} />
                </Button>
              </div>

              {product.stock_quantity > 0 && product.stock_quantity <= 10 && (
                <p className="text-sm text-destructive">
                  Only {product.stock_quantity} left in stock!
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
                      <img
                        src={relatedProduct.images?.[0] || "/placeholder.svg"}
                        alt={relatedProduct.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <h3 className="font-medium group-hover:text-primary transition-colors line-clamp-2">
                      {relatedProduct.name}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold">₹{Number(relatedProduct.price).toFixed(2)}</span>
                      {relatedProduct.compare_at_price && (
                        <span className="text-sm text-muted-foreground line-through">
                          ₹{Number(relatedProduct.compare_at_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Product Reviews */}
          <ProductReviews productId={product.id} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
