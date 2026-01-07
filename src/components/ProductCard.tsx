import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
}: ProductCardProps) => {
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { isMember } = useUserRole();
  
  // Show member price if user is a member and member_price exists
  const displayPrice = isMember && memberPrice ? memberPrice : price;
  // For members, show MRP as strikethrough. For non-members, show compare_at_price if exists
  const strikethroughPrice = isMember && memberPrice ? price : originalPrice;
  
  const discount = strikethroughPrice ? Math.round(((strikethroughPrice - displayPrice) / strikethroughPrice) * 100) : 0;
  const inWishlist = isInWishlist(id);

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
        <img
          src={image}
          alt={name}
          className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500"
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
          {isMember && memberPrice && (
            <Badge className="bg-green-600 text-white">Member Price</Badge>
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
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-2">
          {name}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-primary">₹{displayPrice}</span>
          {strikethroughPrice && strikethroughPrice > displayPrice && (
            <span className="text-sm text-muted-foreground line-through">
              ₹{strikethroughPrice}
            </span>
          )}
        </div>
        {!isMember && memberPrice && (
          <p className="text-xs text-green-600 mt-1">
            Member price: ₹{memberPrice}
          </p>
        )}
      </CardContent>
    </Card>
    </Link>
  );
};

export default ProductCard;
