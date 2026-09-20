import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Registration and updates are handled entirely by our own code
      // (src/components/pwa/PWABadge.tsx, gated by src/pwa/sw-guard.ts) via a
      // plain navigator.serviceWorker.register call — we do NOT use
      // vite-plugin-pwa's generated register module (virtual:pwa-register).
      // That module's own "prompt" flow attaches its own controllerchange
      // listener that force-reloads unconditionally once it has seen a
      // "waiting" worker — bypassing any checkout/payment guard. With
      // skipWaiting below, the "waiting" state is short-lived enough that
      // this could fire unpredictably. Registering directly ourselves means
      // our guarded listener is the only thing reacting to controllerchange.
      // injectRegister: null also keeps the plugin from auto-injecting any
      // registration script (needed so Lovable preview stays SW-free).
      injectRegister: null,
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico", "favicon.png", "robots.txt"],
      manifest: {
        name: "ELA Foods - Mother's Touch",
        short_name: "ELA Foods",
        description: "Premium homemade snacks crafted with love",
        theme_color: "#f97316",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/?pwa=true",
        scope: "/",
        icons: [
          {
            src: "/icons/customer/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/customer/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/customer/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // skipWaiting + clientsClaim are both required for an already-stuck
        // visitor to ever recover. skipWaiting makes a newly downloaded
        // service worker activate itself the moment the browser notices it
        // changed — which happens on the browser's OWN update schedule
        // (every navigation, and the spec forces a re-check at least every
        // 24h regardless of HTTP cache headers), completely independent of
        // whatever JS is currently loaded on the page. That's essential: a
        // visitor stuck on a broken/ancient build is running the exact code
        // that would need to detect and apply an update, so nothing about
        // that old code can be trusted to fix itself — only the browser's
        // native, code-independent check can. clientsClaim then hands that
        // now-active worker control of any already-open tabs immediately
        // instead of only on their next navigation. The app's own
        // controllerchange listener (PWABadge.tsx) decides *when* it's safe
        // to actually reload the visible page (never mid checkout/payment).
        skipWaiting: true,
        clientsClaim: true,
        // On activation, navigate tabs still running an old build (see file).
        importScripts: ["sw-reload-stale-tabs.js"],
        runtimeCaching: [
          {
            // Auth, database, edge-function (OTP/payment) and realtime calls
            // must always hit the network. NetworkFirst would fall back to a
            // stale cached response on any failed request (e.g. a cached
            // /auth/v1/user for a dead session, or another user's /rest/v1
            // data on a shared browser). Listed first: Workbox uses the first
            // matching route.
            urlPattern: /^https:\/\/[^/]+\.supabase\.(?:co|in)\/(?:auth|rest|functions|realtime)\/v1\//i,
            handler: "NetworkOnly",
          },
          {
            // Remaining Supabase traffic (Storage images) keeps its existing behaviour.
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
