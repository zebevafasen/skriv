import { AppError, type AppErrorCode } from "@asterism/application";
import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.js";

type QueryMethod = "run" | "all" | "get" | "values";
type QueryResult = { rows: unknown[][] };
type ExecuteResult = { rowsAffected: number; lastInsertId: number | null; rows: unknown[][] };

export type AtomicStatement = {
  statement: string;
  parameters: unknown[];
  method: QueryMethod;
  expectedRowsAffected?: number;
};

export type NativeDatabaseBridge = {
  query(statement: string, parameters: unknown[]): Promise<QueryResult>;
  execute(statement: string, parameters: unknown[]): Promise<ExecuteResult>;
  atomic(statements: AtomicStatement[]): Promise<Array<QueryResult | ExecuteResult>>;
};

const nativeCodes = new Set<AppErrorCode>([
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "PROVIDER_ERROR",
  "CREDENTIAL_ERROR",
  "CANCELLED",
  "DATABASE_ERROR",
  "FILE_ERROR",
  "INTERNAL_ERROR",
]);

function databaseError(error: unknown): AppError {
  const payload = error as { code?: string; message?: string };
  const code = nativeCodes.has(payload.code as AppErrorCode)
    ? (payload.code as AppErrorCode)
    : "DATABASE_ERROR";
  return new AppError(
    payload.message ?? (error instanceof Error ? error.message : String(error)),
    code,
  );
}

async function invokeDatabase<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw databaseError(error);
  }
}

export function createTauriDatabaseBridge(): NativeDatabaseBridge {
  return {
    query(statement, parameters) {
      return invokeDatabase<QueryResult>("db_query", { request: { statement, parameters } });
    },
    execute(statement, parameters) {
      return invokeDatabase<ExecuteResult>("db_execute", { request: { statement, parameters } });
    },
    atomic(statements) {
      return invokeDatabase<Array<QueryResult | ExecuteResult>>("db_atomic", { statements });
    },
  };
}

export function createLocalDatabase(bridge: NativeDatabaseBridge = createTauriDatabaseBridge()) {
  return drizzle(
    async (statement, parameters, method) => {
      if (method === "run") return bridge.execute(statement, parameters);
      const result = await bridge.query(statement, parameters);
      if (method === "get") return { rows: result.rows[0] ?? [] };
      return result;
    },
    async (queries) => {
      const results = await bridge.atomic(
        queries.map((query) => ({
          statement: query.sql,
          parameters: query.params,
          method: query.method,
          ...(/^\s*update\b[\s\S]*\breturning\b/i.test(query.sql)
            ? { expectedRowsAffected: 1 }
            : {}),
        })),
      );
      return results.map((result) => ({ rows: result.rows }));
    },
    { schema },
  );
}

export type LocalDatabase = ReturnType<typeof createLocalDatabase>;
