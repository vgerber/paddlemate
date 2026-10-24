import { defineConfig } from "@vite-pwa/assets-generator/config";

// App icons from public/logo.svg; favicon.ico is built by scripts/gen-icons.sh
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [],
    },
    maskable: {
      sizes: [512],
      padding: 0.1,
      resizeOptions: { background: "#ffffff", fit: "contain" },
    },
    apple: {
      sizes: [180],
      padding: 0.1,
      resizeOptions: { background: "#ffffff", fit: "contain" },
    },
  },
  images: ["public/logo.svg"],
});
