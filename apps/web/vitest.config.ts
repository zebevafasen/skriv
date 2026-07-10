import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    exclude: ["dist/**", "node_modules/**", "e2e/**"],
  },
});
