import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import pkg from "./package.json";

// APP_VERSION is injected by the deploy pipeline from the git tag (e.g. v1.2.3 → "1.2.3").
// Falls back to package.json version for local dev and non-tag workflow_dispatch runs.
const version: string = process.env["APP_VERSION"] ?? pkg.version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Squickr Rook",
        short_name: "Rook",
        description: "Offline 2v2 trick-taking card game",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1a1a2e",
        theme_color: "#1a1a2e",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
