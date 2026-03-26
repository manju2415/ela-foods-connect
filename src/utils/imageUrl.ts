/**
 * Optimize Supabase Storage image URLs with transform parameters.
 * Falls back to original URL for non-Supabase images.
 */
export function getOptimizedImageUrl(
  url: string,
  _options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: "webp" | "origin";
  } = {}
): string {
  // Return URL as-is — Supabase image transforms are not available on this project.
  // The OptimizedImage component still handles lazy loading, blur placeholders, etc.
  return url || "";
}

/**
 * Get srcSet-like sizes for responsive images
 */
export function getResponsiveImageUrls(
  url: string,
  widths: number[] = [320, 640, 960, 1280]
) {
  return widths.map((w) => ({
    url: getOptimizedImageUrl(url, { width: w }),
    width: w,
  }));
}
