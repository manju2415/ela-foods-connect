/**
 * Optimize Supabase Storage image URLs with transform parameters.
 * Falls back to original URL for non-Supabase images.
 */
export function getOptimizedImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: "webp" | "origin";
  } = {}
): string {
  if (!url) return url;

  const { width, height, quality = 75, format = "webp" } = options;

  // Only transform Supabase storage URLs
  const isSupabaseStorage =
    url.includes("supabase.co/storage/") || url.includes("supabase.co/storage/");

  if (!isSupabaseStorage) return url;

  // Build transform path: /render/image/... instead of /object/...
  const transformedUrl = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );

  const params = new URLSearchParams();
  if (width) params.set("width", String(width));
  if (height) params.set("height", String(height));
  params.set("quality", String(quality));
  if (format) params.set("format", format);

  const separator = transformedUrl.includes("?") ? "&" : "?";
  return `${transformedUrl}${separator}${params.toString()}`;
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
