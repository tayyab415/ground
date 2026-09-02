import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project Pages live at https://tayyab415.github.io/ground/
// CI sets BASE_PATH=/ground/ for the Actions artifact.
// The committed /docs snapshot uses the default "./" base so githack works
// until Pages is enabled. GitHub Pages serves / or /docs, not /site.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "./",
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true, allowedHosts: true },
});
