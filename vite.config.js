import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import path from "path";

// Function to get HTTPS config
function getHttpsConfig() {
  const keyPath = path.resolve("./localhost-key.pem");
  const certPath = path.resolve("./localhost.pem");

  // Check if certificate files exist
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  // Fallback to basic HTTPS
  console.warn("⚠️  Certificate files not found. Using basic HTTPS.");
  console.warn("   Run: node generate-cert.mjs");
  return true;
}

export default defineConfig({
  server: {
    https: getHttpsConfig(),
    host: "0.0.0.0",
    port: 5173,
  },

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Rally Route Mapper",
        short_name: "RallyMapper",
        description:
          "Record and export rally routes with GPS, icons, and voice input.",
        theme_color: "#1e3a8a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});
