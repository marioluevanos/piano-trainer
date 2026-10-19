import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Installable PWA: web manifest plus a service worker that precaches the app
    // shell and the piano samples so practice works offline.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "Piano Trainer",
        short_name: "Piano",
        description: "Piano practice with sheet music, wait mode and loops.",
        theme_color: "#0f1115",
        background_color: "#0f1115",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,mp3}"],
        // The OSMD bundle is larger than Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  // Relative base so the same build works in a browser and inside a Capacitor WebView.
  base: "./",
});
