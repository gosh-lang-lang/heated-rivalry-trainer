import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Heated Rivalry — тренажёр слов",
        short_name: "Heated Rivalry",
        description: "Английские слова из романа: утром учим, вечером применяем.",
        lang: "ru",
        theme_color: "#12306b",
        background_color: "#0a111d",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  // words.json лежит в корне репозитория (один источник слов для прототипа и приложения)
  server: { fs: { allow: [".."] }, proxy: { "/api": "http://localhost:8787" } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
