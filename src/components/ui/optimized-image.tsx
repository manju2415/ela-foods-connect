import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/utils/imageUrl";

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  priority?: boolean;
  quality?: "low" | "medium" | "high";
  blur?: boolean;
  /** Desired display width — used for Supabase image transforms */
  displayWidth?: number;
  /** Desired display height — used for Supabase image transforms */
  displayHeight?: number;
}

const qualityMap = { low: 50, medium: 75, high: 90 };

/**
 * OptimizedImage component with lazy loading, blur placeholder,
 * Supabase image transforms, and progressive loading.
 */
const OptimizedImage = ({
  src,
  alt,
  className,
  containerClassName,
  priority = false,
  quality = "medium",
  blur = true,
  displayWidth,
  displayHeight,
  ...props
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate optimized URL for Supabase storage images. Request at device
  // pixel ratio (capped at 2x) so the resized image still looks sharp on
  // retina screens, without fetching full-resolution originals everywhere.
  const optimizedSrc = useMemo(() => {
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    return getOptimizedImageUrl(src, {
      width: displayWidth ? Math.round(displayWidth * dpr) : undefined,
      height: displayHeight ? Math.round(displayHeight * dpr) : undefined,
      quality: qualityMap[quality],
    });
  }, [src, displayWidth, displayHeight, quality]);

  useEffect(() => {
    if (priority) {
      setIsInView(true);
      return;
    }

    // Capacitor's WebView is usually current, but this keeps product images
    // functional instead of throwing on older Android/iOS WebViews.
    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px",
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  const placeholderBg = "bg-gradient-to-br from-muted/50 to-muted";

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", containerClassName)}>
      {/* Placeholder */}
      {(!isLoaded || !isInView) && (
        <div
          className={cn(
            "absolute inset-0 animate-pulse",
            placeholderBg
          )}
        />
      )}

      {/* Actual Image */}
      {isInView && !hasError && (
        <img
          src={optimizedSrc}
          alt={alt}
          width={displayWidth}
          height={displayHeight}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className={cn(
            "transition-opacity duration-300",
            blur && !isLoaded ? "blur-sm scale-105" : "blur-0 scale-100",
            !isLoaded ? "opacity-0" : "opacity-100",
            className
          )}
          {...props}
        />
      )}

      {/* Error Fallback */}
      {hasError && (
        <div className={cn("flex items-center justify-center", placeholderBg, className)}>
          <span className="text-muted-foreground text-sm">Image unavailable</span>
        </div>
      )}
    </div>
  );
};

export { OptimizedImage };
