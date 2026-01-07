import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Quote } from "lucide-react";
import { format } from "date-fns";

interface Testimonial {
  id: string;
  title: string;
  content: string;
  rating: number | null;
  is_featured: boolean;
  created_at: string;
  profiles?: {
    full_name: string | null;
  };
  products?: {
    name: string;
  } | null;
}

interface TestimonialsDisplayProps {
  productId?: string;
  featured?: boolean;
  limit?: number;
}

export function TestimonialsDisplay({ productId, featured, limit }: TestimonialsDisplayProps) {
  const { data: testimonials, isLoading } = useQuery({
    queryKey: ["testimonials", productId, featured],
    queryFn: async () => {
      let query = supabase
        .from("testimonials")
        .select(`
          id,
          title,
          content,
          rating,
          is_featured,
          created_at,
          user_id,
          products:product_id (name)
        `)
        .eq("is_approved", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (productId) {
        query = query.eq("product_id", productId);
      }

      if (featured) {
        query = query.eq("is_featured", true);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data: testimonialData, error } = await query;
      if (error) throw error;

      // Fetch profile data separately
      const userIds = [...new Set(testimonialData.map(t => t.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      return testimonialData.map(t => ({
        ...t,
        profiles: profilesMap.get(t.user_id) || { full_name: null }
      })) as Testimonial[];
    },
  });

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-3/4 mb-3" />
              <div className="h-20 bg-muted rounded mb-3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!testimonials || testimonials.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {testimonials.map((testimonial) => (
        <Card key={testimonial.id} className="relative overflow-hidden">
          <CardContent className="p-6">
            <Quote className="absolute top-4 right-4 h-8 w-8 text-primary/10" />
            
            <div className="flex items-center gap-2 mb-3">
              {renderStars(testimonial.rating)}
              {testimonial.is_featured && (
                <Badge className="bg-yellow-100 text-yellow-800 text-xs">Featured</Badge>
              )}
            </div>

            <h4 className="font-semibold mb-2">{testimonial.title}</h4>
            
            <p className="text-muted-foreground text-sm line-clamp-4 mb-4">
              {testimonial.content}
            </p>

            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{testimonial.profiles?.full_name || "Anonymous"}</p>
                {testimonial.products?.name && (
                  <p className="text-xs text-muted-foreground">{testimonial.products.name}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(testimonial.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}