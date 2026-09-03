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
