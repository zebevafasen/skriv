import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../../.env") });

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./index.js";

const connectionString = (
  process.env.DATABASE_URL ?? "postgresql://asterism:asterism@localhost:5433/asterism"
).replace("sslmode=require", "sslmode=verify-full");
const { db, pool } = createDatabase(connectionString);

await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await pool.end();
