import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Regenerate the icons in public/ from icon.svg with: npm run icons
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#0f1115" } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#0f1115" } },
  },
  images: ["public/icon.svg"],
});
