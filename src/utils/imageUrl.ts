/**
 * Optimize remote image URLs via wsrv.nl (images.weserv.nl), a free public
 * resize/re-encode proxy.
 *
 * Supabase's own Storage image-transform (render/image) endpoint was tried
 * in production as of 2026-09 and every image came back broken — the
 * project's plan doesn't actually serve it despite transforms supposedly
 * being available — so this proxies through wsrv.nl instead. Verified
 * against this project's storage: a 114KB original product PNG came back as
 * a 20KB webp at w=400/q=75 (https://wsrv.nl/?url=<encoded original>&w=400&q=75&output=webp).
 * Only absolute http(s) URLs are proxied; local/relative paths (e.g.
 * "/placeholder.svg") pass through untouched since wsrv.nl needs a
 * publicly-fetchable source URL. If the proxy ever fails for a given image,
 * OptimizedImage already retries once with the original `src` before giving
 * up, so this has a built-in fallback.
 */
const WSRV_ENDPOINT = "https://wsrv.nl/";
const DEFAULT_WIDTH = 800;

// Largest width any uploaded image can have: admin uploads are downscaled
// before upload (src/utils/imageCompression.ts) to 1920px, or 2560px for
// banners. Asking the proxy for more than this can only upscale — a bigger
// download with no extra detail.
const MAX_SOURCE_IMAGE_WIDTH = 2560;

/**
 * Multiplier applied to an image's display size when requesting it: device
 * pixel ratio (capped at 2x) so it stays sharp on retina screens, but never
 * so much that the request exceeds the largest possible source width.
 */
export function getImageRequestScale(displayWidth?: number): number {
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  if (!displayWidth) return dpr;
  return Math.max(1, Math.min(dpr, MAX_SOURCE_IMAGE_WIDTH / displayWidth));
}

export function getOptimizedImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}
): string {
  if (!url || !/^https?:\/\//i.test(url)) return url || "";

  const params = new URLSearchParams({ url });
  params.set("w", String(options.width ?? DEFAULT_WIDTH));
  if (options.height) {
    params.set("h", String(options.height));
    params.set("fit", "cover");
  }
  params.set("q", String(options.quality ?? 75));
  params.set("output", "webp");

  return `${WSRV_ENDPOINT}?${params.toString()}`;
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
