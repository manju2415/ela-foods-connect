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
      // "prompt" (not "autoUpdate"): with autoUpdate, vite-plugin-pwa's own
      // register module skips onNeedRefresh entirely and forces an
      // unconditional window.location.reload() the instant a new SW
      // activates — with no way to check whether the user is mid checkout.
      // "prompt" keeps the new worker in the browser's normal "waiting"
      // state so PWABadge decides *when* it's safe to call
      // updateServiceWorker(true) (never while isOnSensitivePage()).
      registerType: "prompt",
      // Registration is handled by our own guarded wrapper (src/pwa/sw-guard.ts)
      // so the plugin never auto-injects a registration script (keeps Lovable preview SW-free).
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
        // clientsClaim: the moment the app explicitly activates a waiting SW
        // (see PWABadge's updateServiceWorker(true) call), let it take control
        // of any already-open tabs immediately rather than only on their next
        // navigation — so once we've decided it's safe to update, it applies
        // everywhere without an extra reload cycle.
        //
        // Deliberately NOT setting skipWaiting here: that would make the new
        // SW call self.skipWaiting() unconditionally on install and activate
        // itself in the background regardless of what the user is doing,
        // which is what let the previous "autoUpdate" registerType force a
        // reload mid-checkout. Leaving it unset keeps the SW's default
        // postMessage-triggered skipWaiting listener, which is what
        // PWABadge's guarded updateServiceWorker(true) relies on.
        clientsClaim: true,
        runtimeCaching: [
          {
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
