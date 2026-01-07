import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  priority?: boolean;
  quality?: "low" | "medium" | "high";
  blur?: boolean;
}

/**
 * OptimizedImage component with lazy loading, blur placeholder, and progressive loading
 */
const OptimizedImage = ({
  src,
  alt,
  className,
  containerClassName,
  priority = false,
  quality = "medium",
  blur = true,
  ...props
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (priority) {
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
        rootMargin: "100px",
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
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

  // Placeholder gradient for loading state
  const placeholderBg = "bg-gradient-to-br from-muted/50 to-muted";

  return (
    <div ref={imgRef} className={cn("relative overflow-hidden", containerClassName)}>
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
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "transition-all duration-500",
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
