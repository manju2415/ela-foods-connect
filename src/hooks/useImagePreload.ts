import { useEffect } from "react";

/**
 * Preload critical images for better LCP (Largest Contentful Paint)
 */
export const useImagePreload = (imageSrcs: string[]) => {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];

    imageSrcs.forEach((src) => {
      if (!src) return;

      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = src;
      document.head.appendChild(link);
      links.push(link);
    });

    return () => {
      links.forEach((link) => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      });
    };
  }, [imageSrcs]);
};

/**
 * Preload a single image and return a promise
 */
export const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
};
