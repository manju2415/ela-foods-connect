/**
 * Optimize Supabase Storage image URLs with transform parameters.
 *
 * DISABLED as of 2026-09: the Storage image-transform (render/image) endpoint
 * was tried in production and every product image came back broken (the
 * project's Supabase plan/setup doesn't actually serve it, despite Storage
 * transforms supposedly being available), so this now deliberately returns
 * the original URL untouched. Re-enabling this requires first confirming a
 * transform URL — e.g. one built by hand as
 * "<object-url with /storage/v1/object/public/ swapped for
 * /storage/v1/render/image/public/>?width=400&quality=75" — actually loads
 * in a browser against this project before wiring it back into the app.
 * The OptimizedImage component still handles lazy loading, blur
 * placeholders, priority loading, and explicit width/height, independent of
 * this function.
 */
export function getOptimizedImageUrl(
  url: string,
  _options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}
): string {
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
