import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Paddlemate",
        short_name: "Paddlemate",
        description: "Paddlemate — whitewater section tracker",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Push handling lives in its own file; the rest is generated.
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: "react-vendor",
              // Shared helpers stay with React: left alone, Rolldown parks them in the
              // map or chart chunk, which then loads on every route.
              test: /node_modules\/(react|react-dom|scheduler|use-sync-external-store)\/|vite\/preload-helper/,
            },
            {
              name: "maplibre",
              test: /maplibre-gl|react-map-gl/,
            },
            {
              name: "mui",
              test: /@mui/,
            },
            {
              name: "recharts",
              test: /recharts/,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
