import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "pdf-lib": fileURLToPath(
        new URL(
          "../../packages/application/node_modules/pdf-lib/dist/pdf-lib.esm.js",
          import.meta.url,
        ),
      ),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // The first desktop release is Windows-only. Keeping this explicit also
    // makes `pnpm build` behave like a Tauri production build when Tauri has
    // not populated TAURI_ENV_PLATFORM.
    target: "chrome105",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
