import type { AIProvider } from "@skriv/ai";
import type { ServerEnv } from "@skriv/config";
import type { Database } from "@skriv/db";
import type { BetterAuthOptions, betterAuth } from "better-auth";
import type { Pool } from "pg";

export type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

export type AppContext = {
  db: Database;
  pool: Pool;
  env: ServerEnv;
  defaultAi: AIProvider | null;
  getAi: (userId: string, model?: string) => Promise<AIProvider>;
  auth: AuthInstance;
};

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}
