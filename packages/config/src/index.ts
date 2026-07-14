import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../../.env") });

const optionalBooleanFromString = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

const optionalSecret = z
  .string()
  .transform((value) => (value.trim() === "" ? undefined : value))
  .pipe(z.string().min(16).optional())
  .optional();

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
    DATABASE_URL: z
      .string()
      .min(1)
      .default("postgresql://asterism:asterism@localhost:5433/asterism"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32)
      .default("development-only-secret-at-least-32-characters"),
    BETTER_AUTH_URL: z.url().default("http://localhost:3001"),
    DEV_AUTH_BYPASS: optionalBooleanFromString,
    INVITE_ONLY: optionalBooleanFromString,
    OPENROUTER_API_KEY: z.string().default(""),
    CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).default("development-credential-key-change-me"),
    OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
    AI_PROVIDER: z.enum(["fake", "openrouter"]).default("fake"),
    FAKE_AI_DELAY_MS: z.coerce.number().int().min(0).max(2_000).default(20),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    CRON_SECRET: optionalSecret,
  })
  .transform((value) => ({
    ...value,
    DEV_AUTH_BYPASS: value.DEV_AUTH_BYPASS ?? value.NODE_ENV === "development",
    INVITE_ONLY: value.INVITE_ONLY ?? value.NODE_ENV !== "development",
  }));

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment: ${z.prettifyError(result.error)}`);
  }
  if (result.data.NODE_ENV === "production" && result.data.DEV_AUTH_BYPASS) {
    throw new Error("DEV_AUTH_BYPASS cannot be enabled in production.");
  }
  if (result.data.AI_PROVIDER === "openrouter" && !result.data.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter.");
  }
  if (
    result.data.NODE_ENV === "production" &&
    result.data.CREDENTIAL_ENCRYPTION_KEY === "development-credential-key-change-me"
  ) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be set to a private value in production.");
  }
  return result.data;
}
