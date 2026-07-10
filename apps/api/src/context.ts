import type { AIProvider } from "@asterism/ai";
import type { ServerEnv } from "@asterism/config";
import type { Database } from "@asterism/db";
import type { BetterAuthOptions, betterAuth } from "better-auth";
import type { Pool } from "pg";

export type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

export type AppContext = {
  db: Database;
  pool: Pool;
  env: ServerEnv;
  defaultAi: AIProvider;
  fakeAi: AIProvider;
  getAi: (userId: string, model?: string) => Promise<AIProvider>;
  auth: AuthInstance;
};

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}
