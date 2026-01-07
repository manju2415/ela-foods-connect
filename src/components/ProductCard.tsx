import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { ShoppingCart, Heart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useUserRole } from "@/hooks/useUserRole";

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
}: ProductCardProps) => {
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { isMember } = useUserRole();
  
  // Calculate discount for compare_at_price
  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
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

  const unitDisplay = getUnitDisplay();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(id);
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
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <Button className="w-full gap-2" size="sm" onClick={handleAddToCart}>
            <ShoppingCart className="h-4 w-4" />
            Add to Cart
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
        {unitDisplay && (
          <p className="text-xs text-muted-foreground mb-2">{unitDisplay}</p>
        )}
        {/* Pricing - Show both MRP and Member Price */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">MRP:</span>
            <span className={`font-bold ${memberPrice && isMember ? 'text-muted-foreground line-through' : 'text-lg text-primary'}`}>
              ₹{price}
            </span>
            {originalPrice && originalPrice > price && (
              <span className="text-sm text-muted-foreground line-through">
                ₹{originalPrice}
              </span>
            )}
          </div>
          {memberPrice && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-600 font-medium">Member Price:</span>
              <span className={`font-bold ${isMember ? 'text-lg text-green-600' : 'text-green-600'}`}>
                ₹{memberPrice}
              </span>
              {isMember && (
                <Badge className="bg-green-600 text-white text-xs px-1.5 py-0.5">Your Price</Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </Link>
  );
};

export default ProductCard;
