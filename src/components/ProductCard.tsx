import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Heart, Crown } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
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
  /** "compact" renders a smaller card for dense horizontal-scroll rows */
  variant?: "default" | "compact";
}


const ProductCard = ({
  id,
  name,
  slug,
  price,
  memberPrice,
  originalPrice,
  image,
  unitType,
  unitValue,
  variantOptions,
  variant = "default",
}: ProductCardProps) => {
  const { addToCart } = useCart();
  const navigate = useNavigate();

  const options = variantOptions ?? [];
  const hasOptions = options.length > 0;
  const [selectedKey, setSelectedKey] = useState<string>(
    options.find((option) => option.stock > 0)?.key ?? options[0]?.key ?? ""
  );
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

  const displayPrice = activeOption ? activeOption.price : price;
  const outOfStock = activeOption ? activeOption.stock <= 0 : false;
  // Auto-calculate member price if not set (10% discount)
  const effectiveMemberPrice = activeOption
    ? activeOption.memberPrice ?? Math.round(activeOption.price * 0.9)
    : memberPrice ?? Math.round(price * 0.9);
  // Calculate discount for compare_at_price
  const discount = originalPrice && originalPrice > displayPrice
    ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
    : 0;
  const inWishlist = isInWishlist(id);

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

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(id);
  };

  const isCompact = variant === "compact";

  return (
    <Card className="group w-full overflow-hidden border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md h-full flex flex-col">
      <div className="relative">
        <Link to={`/product/${slug}`} aria-label={`View ${name}`}>
          <OptimizedImage
            src={image}
            alt={name}
            className="w-full aspect-square object-cover"
            containerClassName="aspect-square"
            displayWidth={isCompact ? 200 : 400}
            displayHeight={isCompact ? 200 : 400}
          />
        </Link>

        {discount > 0 && (
          <div
            className="absolute top-0 left-2 bg-secondary text-secondary-foreground text-[10px] font-bold px-2 pt-1 pb-1.5 leading-none shadow-sm"
            style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)" }}
          >
            {discount}% off
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className={`absolute top-1 right-1 h-7 w-7 bg-card/80 hover:bg-card transition-opacity ${
            inWishlist ? "opacity-100 text-destructive" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"
          }`}
          onClick={handleToggleWishlist}
        >
          <Heart className={`h-3.5 w-3.5 ${inWishlist ? "fill-current" : ""}`} />
        </Button>
      </div>

      <CardContent className="p-2.5 flex-1 flex flex-col gap-1">
        <Link to={`/product/${slug}`} className="block">
          <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 min-h-[2rem] group-hover:text-primary transition-colors">
            {name}
          </h3>
        </Link>

        {!outOfStock && (
          <div className="inline-flex items-center gap-1 bg-secondary/20 border border-secondary/50 text-secondary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit">
            <Crown className="h-2.5 w-2.5 fill-current shrink-0" />
            Get for ₹{effectiveMemberPrice}
          </div>
        )}

        {options.length > 1 ? (
          <div
            className="mt-0.5"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <Select value={activeOption?.key} onValueChange={setSelectedKey}>
              <SelectTrigger className="h-7 text-[11px] px-2">
                <SelectValue placeholder="Select pack" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.key} disabled={o.stock <= 0}>
                    {o.label} · ₹{o.price} · {o.stock > 0 ? `${o.stock} available` : "Out of stock"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          unitDisplay && <p className="text-[11px] text-muted-foreground">{unitDisplay}</p>
        )}

        {outOfStock ? (
          <p className="text-[11px] text-destructive mt-auto">Out of stock</p>
        ) : (
          <div className="mt-auto">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-foreground">₹{displayPrice}</span>
              {originalPrice && originalPrice > displayPrice && (
                <span className="text-[11px] text-muted-foreground line-through">₹{originalPrice}</span>
              )}
            </div>
            {activeOption && (
              <p className="text-[11px] text-muted-foreground">{activeOption.stock} available</p>
            )}
          </div>
        )}

        <Button
          size="sm"
          className="w-full h-8 min-h-[32px] text-xs font-semibold mt-1"
          onClick={handleAddToCart}
          disabled={outOfStock}
        >
          {outOfStock ? "Sold Out" : "Add"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ProductCard;
