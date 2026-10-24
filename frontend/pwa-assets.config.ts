import { defineConfig } from "@vite-pwa/assets-generator/config";

// Transparent app icons from public/logo.svg. The maskable and Apple icons sit
// on the teal tile and are rendered by scripts/gen-favicon.mjs; favicon.ico is
// built by scripts/gen-icons.sh.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [],
    },
    maskable: { sizes: [] },
    apple: { sizes: [] },
  },
  images: ["public/logo.svg"],
});
