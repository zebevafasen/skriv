import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>["db"];

export function createDatabase(connectionString: string) {
  // Fix for pg-connection-string v3.0.0 warning:
  // Treat sslmode=require as verify-full to maintain current behavior.
  const url = connectionString.replace("sslmode=require", "sslmode=verify-full");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export * from "./schema.js";
