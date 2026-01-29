import { useEffect } from "react";

type AppType = "customer" | "driver" | "member";

const manifestPaths: Record<AppType, string> = {
  customer: "/manifest-customer.json",
  driver: "/manifest-driver.json",
  member: "/manifest-member.json",
};

const themeColors: Record<AppType, string> = {
  customer: "#f97316",
  driver: "#16a34a",
  member: "#7c3aed",
};

export function useAppManifest(appType: AppType) {
  useEffect(() => {
    // Remove any existing manifest links
    const existingManifest = document.querySelector('link[rel="manifest"]');
    if (existingManifest) {
      existingManifest.remove();
    }

    // Add the correct manifest for this app
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = manifestPaths[appType];
    document.head.appendChild(manifestLink);

    // Update theme color
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", themeColors[appType]);
    } else {
      themeColorMeta = document.createElement("meta");
      themeColorMeta.setAttribute("name", "theme-color");
      themeColorMeta.setAttribute("content", themeColors[appType]);
      document.head.appendChild(themeColorMeta);
    }

    // Update apple touch icon
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) {
      appleIcon.setAttribute("href", `/icons/${appType}/pwa-192.png`);
    }

    return () => {
      // Cleanup - restore default manifest if needed
    };
  }, [appType]);
}
