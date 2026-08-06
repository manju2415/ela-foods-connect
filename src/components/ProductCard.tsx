import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { ShoppingCart, Heart, Zap } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import type { VariantOption } from "@/lib/variantOptions";

interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  price: number; // MRP price for everyone
  memberPrice?: number | null; // Discounted price for members only
  originalPrice?: number; // compare_at_price (strikethrough price)
  image: string;
  category: string;
  isNew?: boolean;
  isBestSeller?: boolean;
  unitType?: string | null;
  unitValue?: number | null;
  gstPercentage?: number | null;
  gstInclusive?: boolean | null;
  /** Optional grouped pack/quantity options (same product name, different packs) */
  variantOptions?: VariantOption[];
}


const ProductCard = ({
  id,
  name,
  slug,
  price,
  memberPrice,
  originalPrice,
  image,
  category,
  isNew,
  isBestSeller,
  unitType,
  unitValue,
  gstPercentage,
  gstInclusive,
  variantOptions,
}: ProductCardProps) => {
  const { addToCart, buyNow } = useCart();
  const navigate = useNavigate();

  const options = variantOptions ?? [];
  const hasOptions = options.length > 0;
  const [selectedKey, setSelectedKey] = useState<string>(options[0]?.key ?? "");
  const activeOption = hasOptions
    ? options.find((o) => o.key === selectedKey) ?? options[0]
    : null;

  // Products with unit variants must be configured on the detail page
  const hasVariants = async () => {
    const { count } = await supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id)
      .eq("is_active", true);
    return (count || 0) > 0;
  };
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { isMember } = useUserRole();

  const displayPrice = activeOption ? activeOption.price : price;
  const outOfStock = activeOption ? activeOption.stock <= 0 : false;
  // Auto-calculate member price if not set (10% discount)
  const effectiveMemberPrice = activeOption
    ? activeOption.memberPrice ?? Math.round(activeOption.price * 0.9)
    : memberPrice ?? Math.round(price * 0.9);
  // Calculate discount for compare_at_price
  const discount = originalPrice ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100) : 0;
  const memberDiscount = Math.round(((displayPrice - effectiveMemberPrice) / displayPrice) * 100);
  const inWishlist = isInWishlist(id);


  // GST calculation
  const gstRate = gstPercentage || 0;
  const calculateGstBreakdown = (displayPrice: number) => {
    if (gstRate === 0) return { basePrice: displayPrice, gstAmount: 0 };
    if (gstInclusive) {
      // Price includes GST, calculate base price
      const basePrice = Math.round((displayPrice * 100) / (100 + gstRate));
      const gstAmount = displayPrice - basePrice;
      return { basePrice, gstAmount };
    } else {
      // Price excludes GST
      const gstAmount = Math.round((displayPrice * gstRate) / 100);
      return { basePrice: displayPrice, gstAmount };
    }
  };

  const gstBreakdown = calculateGstBreakdown(isMember ? effectiveMemberPrice : displayPrice);

  // Format unit display
  const getUnitDisplay = () => {
    if (!unitType) return null;
    const unitLabels: Record<string, string> = {
      g: 'g',
      kg: 'kg',
      ml: 'ml',
      litre: 'L',
      packet: 'pkt',
      piece: 'pc',
      box: 'box',
      dozen: 'doz',
    };
    const label = unitLabels[unitType] || unitType;
    if (unitValue) {
      return `${unitValue}${label}`;
    }
    return null;
  };

  const unitDisplay = activeOption ? activeOption.label : getUnitDisplay();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeOption) {
      if (outOfStock) return;
      addToCart(activeOption.productId, 1, activeOption.variantId);
      return;
    }
    if (await hasVariants()) {
      navigate(`/product/${slug}`);
      return;
    }
    addToCart(id);
  };

  const handleBuyNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeOption) {
      if (outOfStock) return;
      buyNow(activeOption.productId, 1, activeOption.variantId);
      return;
    }
    if (await hasVariants()) {
      navigate(`/product/${slug}`);
      return;
    }
    buyNow(id);
  };


  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(id);
  };

  return (
    <Link to={`/product/${slug}`}>
      <Card className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg">
      <div className="relative overflow-hidden">
        <OptimizedImage
          src={image}
          alt={name}
          className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500"
          containerClassName="aspect-square"
          displayWidth={500}
          displayHeight={500}
        />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {isNew && (
            <Badge className="bg-accent text-accent-foreground">New</Badge>
          )}
          {isBestSeller && (
            <Badge className="bg-primary text-primary-foreground">Best Seller</Badge>
          )}
          {discount > 0 && (
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
              {discount}% OFF
            </Badge>
          )}
        </div>

        {/* Wishlist Button */}
        <Button
          variant="ghost"
          size="icon"
          className={`absolute top-3 right-3 bg-card/80 hover:bg-card transition-opacity ${
            inWishlist ? "opacity-100 text-destructive" : "opacity-0 group-hover:opacity-100 hover:text-primary"
          }`}
          onClick={handleToggleWishlist}
        >
          <Heart className={`h-5 w-5 ${inWishlist ? "fill-current" : ""}`} />
        </Button>

        {/* Quick Add Button */}
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex gap-2">
          <Button className="flex-1 gap-1" size="sm" onClick={handleAddToCart} disabled={outOfStock}>
            <ShoppingCart className="h-4 w-4" />
            Cart
          </Button>
          <Button className="flex-1 gap-1" size="sm" variant="secondary" onClick={handleBuyNow} disabled={outOfStock}>
            <Zap className="h-4 w-4" />
            Buy Now
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          {category}
        </p>
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
          {name}
        </h3>
        {options.length > 1 ? (
          <div
            className="mb-2"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <Select value={activeOption?.key} onValueChange={setSelectedKey}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select pack" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.key} disabled={o.stock <= 0}>
                    {o.label} · ₹{o.price}{o.stock <= 0 ? " (Out of stock)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          unitDisplay && <p className="text-xs text-muted-foreground mb-2">{unitDisplay}</p>
        )}
        {outOfStock && (
          <p className="text-xs text-destructive mb-1">Out of stock</p>
        )}
        {/* Pricing - Show both MRP and Member Price */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">MRP:</span>
            <span className={`font-bold ${isMember ? 'text-muted-foreground line-through' : 'text-lg text-primary'}`}>
              ₹{displayPrice}
            </span>
            {originalPrice && originalPrice > displayPrice && (
              <span className="text-sm text-muted-foreground line-through">
                ₹{originalPrice}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-green-600 font-medium">Member:</span>
            <span className={`font-bold ${isMember ? 'text-lg text-green-600' : 'text-green-600'}`}>
              ₹{effectiveMemberPrice}
            </span>
            {memberDiscount > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                {memberDiscount}% OFF
              </Badge>
            )}
            {isMember && (
              <Badge className="bg-green-600 text-white text-xs px-1.5 py-0.5">Your Price</Badge>
            )}
          </div>
          {/* GST Breakdown */}
          {gstRate > 0 && (
            <div className="text-xs text-muted-foreground pt-1 border-t border-border/50 mt-1">
              <div className="flex justify-between">
                <span>Base Price:</span>
                <span>₹{gstBreakdown.basePrice}</span>
              </div>
              <div className="flex justify-between">
                <span>GST ({gstRate}%){gstInclusive ? ' incl.' : ''}:</span>
                <span>₹{gstBreakdown.gstAmount}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </Link>
  );
};

export default ProductCard;
