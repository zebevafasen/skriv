import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDatabase } from "./index.js";
import { compendiumEntries } from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../../.env") });

const connectionString = (
  process.env.DATABASE_URL ?? "postgresql://asterism:asterism@localhost:5433/asterism"
).replace("sslmode=require", "sslmode=verify-full");
const { db, pool } = createDatabase(connectionString);

await db.delete(compendiumEntries).where(eq(compendiumEntries.typeId, "project.instructions"));
await pool.end();
