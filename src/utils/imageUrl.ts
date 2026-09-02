// Public storage URLs look like:
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
// The on-the-fly image transform (render) endpoint swaps "object" for
// "render/image" and takes width/height/quality/resize as query params —
// available on Supabase's paid Storage tier.
const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * Optimize Supabase Storage image URLs with transform parameters — requests
 * a server-resized/compressed version instead of the full original, so a
 * small product-card thumbnail doesn't download a multi-megabyte photo.
 * Falls back to the original URL for non-Supabase-storage images (external
 * URLs, local placeholders, etc.).
 */
export function getOptimizedImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}
): string {
  if (!url) return "";
  if (!url.includes(STORAGE_OBJECT_PATH)) return url;

  const { width, height, quality } = options;
  // The render endpoint needs at least one dimension to do anything useful.
  if (!width && !height) return url;

  const renderUrl = url.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH);
  const params = new URLSearchParams();
  if (width) params.set("width", String(Math.round(width)));
  if (height) params.set("height", String(Math.round(height)));
  if (width && height) params.set("resize", "cover");
  params.set("quality", String(quality ?? 75));

  return `${renderUrl}?${params.toString()}`;
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
