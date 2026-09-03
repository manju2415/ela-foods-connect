import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Heart, Crown, Flame, Star } from "lucide-react";
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
  isFastSelling?: boolean;
  unitType?: string | null;
  unitValue?: number | null;
  gstPercentage?: number | null;
  gstInclusive?: boolean | null;
  /** Optional grouped pack/quantity options (same product name, different packs) */
  variantOptions?: VariantOption[];
  /** "compact" renders a smaller card for dense horizontal-scroll rows */
  variant?: "default" | "compact";
  /** Load the image eagerly instead of lazily — set for cards visible above the fold on first paint */
  imagePriority?: boolean;
}


const ProductCard = ({
  id,
  name,
  slug,
  price,
  memberPrice,
  originalPrice,
  image,
  isBestSeller,
  isFastSelling,
  unitType,
  unitValue,
  variantOptions,
  variant = "default",
  imagePriority = false,
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
            priority={imagePriority}
          />
        </Link>

        {discount > 0 && (
          <div
            className="absolute top-0 left-2 bg-secondary text-secondary-foreground text-[10px] font-bold px-2 pt-1 pb-1.5 leading-none shadow-sm"
            style={{color:"red" }}
          >
            {discount}% 
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

        <div className="flex min-h-[19px] flex-wrap items-start gap-1">
          {isFastSelling && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              <Flame className="h-2.5 w-2.5" />
              Fast Selling
            </span>
          )}
          {isBestSeller && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Star className="h-2.5 w-2.5 fill-current" />
              Best Seller
            </span>
          )}
        </div>

        <div
          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 shadow-sm ${
            outOfStock
              ? "border-border bg-muted text-muted-foreground"
              : "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-900/70 dark:text-emerald-50"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              outOfStock
                ? "bg-muted-foreground/30 text-muted-foreground"
                : "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950"
            }`}
          >
            <Crown className="h-3.5 w-3.5 fill-current" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75 sm:text-[11px]">
              {outOfStock ? "Status" : "Get Price"}
            </span>
            <span className="block text-base font-extrabold sm:text-lg">
              {outOfStock ? "Unavailable" : `₹${effectiveMemberPrice}`}
            </span>
          </span>
        </div>

        <div className="mt-0.5 min-h-[17px]">
          {options.length > 1 ? (
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <Select value={activeOption?.key} onValueChange={setSelectedKey}>
                <SelectTrigger className="h-7 text-[11px] px-2">
                  <SelectValue placeholder="Select pack" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {options.map((o) => (
                    <SelectItem key={o.key} value={o.key} disabled={o.stock <= 0}>
                      {o.label} · MRP ₹{o.price} · {o.stock > 0 ? `${o.stock} available` : "Out of stock"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            unitDisplay && <p className="text-[11px] text-muted-foreground">{unitDisplay}</p>
          )}
        </div>

        {outOfStock ? (
          <p className="text-[11px] text-destructive mt-auto">Out of stock</p>
        ) : (
          <div className="mt-auto">
            <div className="flex items-baseline gap-x-1 sm:gap-x-1.5 gap-y-0.5 flex-wrap">
              <span className="text-xs font-semibold text-foreground sm:text-sm">MRP: ₹{displayPrice}</span>
              {discount > 0 && (
                <span className="text-[10px] font-bold text-green-600 dark:text-green-400 sm:text-[11px]">{discount}% off</span>
              )}
              {originalPrice && originalPrice > displayPrice && (
                <span className="text-[10px] text-muted-foreground line-through sm:text-[11px]">Original MRP: ₹{originalPrice}</span>
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
