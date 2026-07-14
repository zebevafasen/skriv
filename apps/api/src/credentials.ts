import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { type AIProvider, OpenRouterProvider } from "@asterism/ai";
import { AppError } from "@asterism/application";
import { providerCredentials } from "@asterism/db";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "./context.js";

const provider = "openrouter" as const;

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(secret: string, keySecret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keySecret), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    encryptedSecret: encrypted.toString("base64"),
    secretIv: iv.toString("base64"),
    secretTag: cipher.getAuthTag().toString("base64"),
    secretLastFour: secret.slice(-4),
  };
}

function decrypt(row: typeof providerCredentials.$inferSelect, keySecret: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(keySecret),
    Buffer.from(row.secretIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.secretTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encryptedSecret, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getOpenRouterCredential(context: AppContext, userId: string) {
  const [row] = await context.db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)))
    .limit(1);
  return row ?? null;
}

export async function saveOpenRouterCredential(
  context: AppContext,
  userId: string,
  apiKey: string,
) {
  const value = encrypt(apiKey, context.env.CREDENTIAL_ENCRYPTION_KEY);
  await context.db
    .insert(providerCredentials)
    .values({ userId, provider, ...value })
    .onConflictDoUpdate({
      target: [providerCredentials.userId, providerCredentials.provider],
      set: { ...value, updatedAt: new Date() },
    });
}

export async function deleteOpenRouterCredential(context: AppContext, userId: string) {
  await context.db
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)));
}

export function createProviderResolver(
  context: Pick<AppContext, "db" | "env" | "defaultAi">,
): (userId: string, model?: string) => Promise<AIProvider> {
  return async (userId, model) => {
    if (
      model?.startsWith("asterism/fake-") &&
      context.env.NODE_ENV === "test" &&
      context.defaultAi?.name === "fake"
    ) {
      return context.defaultAi;
    }
    const [row] = await context.db
      .select()
      .from(providerCredentials)
      .where(
        and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)),
      )
      .limit(1);
    const apiKey = row
      ? decrypt(row, context.env.CREDENTIAL_ENCRYPTION_KEY)
      : context.env.OPENROUTER_API_KEY;
    if (apiKey) {
      return new OpenRouterProvider(
        apiKey,
        context.env.OPENROUTER_BASE_URL,
        context.env.WEB_ORIGIN,
      );
    }
    if (context.env.NODE_ENV === "test" && context.defaultAi?.name === "fake") {
      return context.defaultAi;
    }
    throw new AppError("Configure OpenRouter in Settings.", "CREDENTIAL_ERROR");
  };
}
