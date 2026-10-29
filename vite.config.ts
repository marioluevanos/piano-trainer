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
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon-180x180.png",
        "icon.svg",
      ],
      manifest: {
        name: "Piano Trainer",
        short_name: "Piano",
        description: "Piano practice with sheet music, wait mode and loops.",
        theme_color: "#0f1115",
        background_color: "#1c1f27",
        // Standalone keeps the phone's status and navigation bars; the training
        // page alone goes fullscreen (useFullscreen) and locks itself to
        // landscape (useLandscapeLock). Neither belongs here: the manifest
        // would hold every page.
        display: "standalone",
        // A fixed id keeps installed copies tied to this manifest, so they pick up
        // changes (like the display mode) instead of becoming a different app.
        id: "/",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,mp3}"],
        // The OSMD bundle is larger than Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  // Shown in the settings panel, to tell whether an installed PWA runs the latest deploy.
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    ),
  },
  // Relative base so the same build works in a browser and inside a Capacitor WebView.
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        // The libraries change far less often than the app, so keep them in
        // their own long-cached chunks.
        codeSplitting: {
          groups: [
            { name: "osmd", test: /node_modules[\\/]opensheetmusicdisplay/ },
            { name: "firebase", test: /node_modules[\\/]@?firebase/ },
          ],
        },
      },
    },
    // OSMD alone is ~1.4 MB minified and cannot be split further.
    chunkSizeWarningLimit: 1600,
  },
});
