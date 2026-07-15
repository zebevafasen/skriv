import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: (process.env.DATABASE_URL ?? "postgresql://skriv:skriv@localhost:5433/skriv").replace("sslmode=require", "sslmode=verify-full"),
  },
  strict: true,
  verbose: true,
});
