import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "pdf-lib": fileURLToPath(
        new URL("./node_modules/pdf-lib/dist/pdf-lib.esm.js", import.meta.url),
      ),
    },
  },
});
