import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createLocalDatabase,
  type AtomicStatement,
  type NativeDatabaseBridge,
} from "./database.js";
import { createLocalRequestDispatcher } from "./dispatcher.js";
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

  it("appends manuscript items without aggregate position queries", async () => {
    const queried: string[] = [];
    const bridge: NativeDatabaseBridge = {
      query: async (statement) => {
        queried.push(statement);
        return /from "(acts|chapters|scenes)"/i.test(statement) ? { rows: [[4]] } : { rows: [] };
      },
      execute: async () => ({ rows: [], rowsAffected: 1, lastInsertId: null }),
      atomic: async (statements) =>
        statements.map(() => ({ rows: [], rowsAffected: 1, lastInsertId: null })),
    };
    const dispatcher = createLocalRequestDispatcher(createLocalDatabase(bridge));
    const projectId = "10000000-0000-4000-8000-000000000001";
    const actId = "10000000-0000-4000-8000-000000000002";
    const chapterId = "10000000-0000-4000-8000-000000000003";

    await dispatcher.request(`/api/projects/${projectId}/manuscript-items`, {
      method: "POST",
      body: JSON.stringify({ kind: "act", afterActId: null }),
    });
    await dispatcher.request(`/api/projects/${projectId}/manuscript-items`, {
      method: "POST",
      body: JSON.stringify({ kind: "chapter", actId, afterChapterId: null }),
    });
    await dispatcher.request(`/api/projects/${projectId}/manuscript-items`, {
      method: "POST",
      body: JSON.stringify({ kind: "scene", chapterId, afterSceneId: null }),
    });

    const positionQueries = queried.filter((statement) =>
      /from "(acts|chapters|scenes)"/i.test(statement),
    );
    expect(positionQueries).toHaveLength(3);
    expect(
      positionQueries.every((statement) => /order by .*"position" desc limit \?/i.test(statement)),
    ).toBe(true);
    expect(positionQueries.every((statement) => !/max\s*\(/i.test(statement))).toBe(true);
  });
});
