import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the same build works in a browser and inside a Capacitor WebView.
  base: "./",
});
