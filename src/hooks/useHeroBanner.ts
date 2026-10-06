import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const HERO_BANNER_CACHE_KEY = "ela_hero_banner";

export interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  cta_link: string | null;
  image_url: string | null;
  badge_text: string | null;
}

/**
 * The admin-managed home hero banner (banners.location = 'home_hero'), shared
 * by the website hero and the app home banner.
 */
export function useHeroBanner() {
  // Serve the last-known banner instantly so the hero paints on first frame
  const cachedBanner = (() => {
    try {
      const raw = localStorage.getItem(HERO_BANNER_CACHE_KEY);
      return raw ? (JSON.parse(raw) as HeroBanner) : null;
    } catch {
      return null;
    }
  })();

  return useQuery({
    queryKey: ["hero-banner"],
    initialData: cachedBanner ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .eq("location", "home_hero")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      try {
        if (data) localStorage.setItem(HERO_BANNER_CACHE_KEY, JSON.stringify(data));
        else localStorage.removeItem(HERO_BANNER_CACHE_KEY);
      } catch {
        // ignore storage failures (private mode / quota)
      }
      return data as HeroBanner | null;
    },
  });
}
