import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { X } from "lucide-react";
import { useState } from "react";

interface Advertisement {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  link_text: string | null;
}

interface AdvertisementBannerProps {
  placement: string;
  className?: string;
}

export function AdvertisementBanner({ placement, className = "" }: AdvertisementBannerProps) {
  const [dismissedAds, setDismissedAds] = useState<string[]>([]);

  const { data: ads = [] } = useQuery({
    queryKey: ["advertisements", placement],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .eq("placement", placement)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Advertisement[];
    },
  });

  const visibleAds = ads.filter((ad) => !dismissedAds.includes(ad.id));

  if (visibleAds.length === 0) return null;

  const handleDismiss = (adId: string) => {
    setDismissedAds([...dismissedAds, adId]);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {visibleAds.map((ad) => (
        <div
          key={ad.id}
          className="relative rounded-lg overflow-hidden bg-gradient-to-r from-primary/10 to-secondary/10 border border-border"
        >
          <button
            onClick={() => handleDismiss(ad.id)}
            className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors z-10"
            aria-label="Dismiss ad"
          >
            <X className="h-4 w-4" />
          </button>

          {ad.image_url ? (
            <div className="flex flex-col md:flex-row">
              <OptimizedImage
                src={ad.image_url}
                alt={ad.title}
                className="w-full md:w-1/3 h-32 md:h-auto object-cover"
                containerClassName="w-full md:w-1/3 h-32 md:h-auto"
              />
              <div className="p-4 flex-1 flex flex-col justify-center">
                <h3 className="font-semibold text-lg text-foreground mb-1">{ad.title}</h3>
                {ad.description && (
                  <p className="text-sm text-muted-foreground mb-3">{ad.description}</p>
                )}
                {ad.link_url && (
                  <Link to={ad.link_url}>
                    <Button size="sm" variant="secondary">
                      {ad.link_text || "Learn More"}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center">
              <h3 className="font-semibold text-lg text-foreground mb-1">{ad.title}</h3>
              {ad.description && (
                <p className="text-sm text-muted-foreground mb-3">{ad.description}</p>
              )}
              {ad.link_url && (
                <Link to={ad.link_url}>
                  <Button size="sm" variant="secondary">
                    {ad.link_text || "Learn More"}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
