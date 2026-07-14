import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createLocalDatabase,
  type AtomicStatement,
  type NativeDatabaseBridge,
} from "./database.js";
import { projects } from "./schema.js";

describe("desktop SQLite proxy", () => {
  it("marks optimistic UPDATE RETURNING statements as single-row invariants", async () => {
    let captured: AtomicStatement[] = [];
    const bridge: NativeDatabaseBridge = {
      query: async () => ({ rows: [] }),
      execute: async () => ({ rows: [], rowsAffected: 0, lastInsertId: null }),
      atomic: async (statements) => {
        captured = statements;
        return statements.map(() => ({ rows: [], rowsAffected: 0, lastInsertId: null }));
      },
    };
    const db = createLocalDatabase(bridge);
    await db.batch([
      db
        .update(projects)
        .set({ title: "Changed" })
        .where(eq(projects.id, "10000000-0000-4000-8000-000000000001"))
        .returning(),
    ]);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.expectedRowsAffected).toBe(1);
  });
});
