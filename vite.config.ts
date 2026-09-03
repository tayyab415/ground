import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Live: https://tayyab415.github.io/ground/
// CI sets BASE_PATH=/ground/ and deploys dist/. Local builds keep "./".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "./",
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true, allowedHosts: true },
});
