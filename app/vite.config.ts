import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** В dev /login отдаёт login.html (в production это делает server/index.ts). */
const loginRoute = (): Plugin => ({
  name: "login-route",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === "/login" || req.url?.startsWith("/login?")) req.url = req.url.replace("/login", "/login.html");
      next();
    });
  },
});

export default defineConfig({
  build: {
    // без общего полифилла: страница входа не должна тянуть файлы из закрытой /assets/
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { main: resolve(__dirname, "index.html"), login: resolve(__dirname, "login.html") },
      output: {
        // всё, что нужно странице входа, — в /auth/ (единственная папка, открытая без входа)
        entryFileNames: (c) => (c.name === "login" ? "auth/[name]-[hash].js" : "assets/[name]-[hash].js"),
      },
    },
  },
  plugins: [
    loginRoute(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // /login и /api — всегда из сети: без сессии сервер отдаёт только вход
      workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/login/] },
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
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"], environment: "node" },
});
