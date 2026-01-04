import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface CategoryCardProps {
  name: string;
  slug: string;
  image: string;
  productCount: number;
}

const CategoryCard = ({ name, slug, image, productCount }: CategoryCardProps) => {
  return (
    <Link to={`/products?category=${slug}`}>
      <Card className="group relative overflow-hidden cursor-pointer border-0 shadow-md hover:shadow-xl transition-all duration-300">
        <div className="aspect-[4/3] overflow-hidden">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </div>
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
        
        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-xl font-bold text-card mb-1 group-hover:text-secondary transition-colors">
            {name}
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-card/70">{productCount} Products</span>
            <ArrowRight className="h-5 w-5 text-secondary translate-x-0 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Card>
    </Link>
  );
};

export default CategoryCard;
