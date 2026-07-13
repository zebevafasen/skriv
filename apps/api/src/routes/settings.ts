import {
  aiSettingsSchema,
  editorSettingsSchema,
  openRouterCredentialStatusSchema,
  updateAiSettingsInputSchema,
  updateEditorSettingsInputSchema,
  updateOpenRouterCredentialSchema,
} from "@asterism/contracts";
import { aiSettings, editorSettings } from "@asterism/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import {
  deleteOpenRouterCredential,
  getOpenRouterCredential,
  saveOpenRouterCredential,
} from "../credentials.js";
import { parseWith } from "../http.js";

const defaults = aiSettingsSchema.parse({
  baseModel: "asterism/fake-prose",
  contextModel: "asterism/fake-context",
  smartContextEnabled: true,
  recursionDepth: 2,
});
const editorDefaults = editorSettingsSchema.parse({});
const modelCache = new Map<
  string,
  {
    expiresAt: number;
    models: Awaited<ReturnType<AppContext["defaultAi"]["listModels"]>>;
  }
>();

export async function getModels(context: AppContext, userId: string, signal?: AbortSignal) {
  const cached = modelCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  const models = await (await context.getAi(userId)).listModels(signal);
  modelCache.set(userId, { expiresAt: Date.now() + 10 * 60 * 1_000, models });
  return models;
}

export async function getModelContextLength(
  context: AppContext,
  userId: string,
  model: string,
  signal?: AbortSignal,
) {
  const descriptor = (await getModels(context, userId, signal)).find((item) => item.id === model);
  return descriptor?.contextLength ?? 32_768;
}

export async function getModelLimits(
  context: AppContext,
  userId: string,
  model: string,
  signal?: AbortSignal,
) {
  const descriptor = (await getModels(context, userId, signal)).find((item) => item.id === model);
  const contextLength = descriptor?.contextLength ?? 32_768;
  return {
    contextLength,
    maxCompletionTokens: descriptor?.maxCompletionTokens ?? Math.min(16_384, contextLength),
  };
}

export async function getSettings(context: AppContext, userId: string) {
  const [row] = await context.db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1);
  return row ? aiSettingsSchema.parse(row) : defaults;
}

export async function getEditorSettings(context: AppContext, userId: string) {
  const [row] = await context.db
    .select()
    .from(editorSettings)
    .where(eq(editorSettings.userId, userId))
    .limit(1);
  return row ? editorSettingsSchema.parse(row) : editorDefaults;
}

export async function registerSettingsRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/settings/ai", async (request) => getSettings(context, request.userId));

  app.patch("/api/settings/ai", async (request) => {
    const input = parseWith(updateAiSettingsInputSchema, request.body);
    const current = await getSettings(context, request.userId);
    const next = aiSettingsSchema.parse({ ...current, ...input });
    await context.db
      .insert(aiSettings)
      .values({ userId: request.userId, ...next })
      .onConflictDoUpdate({ target: aiSettings.userId, set: { ...next, updatedAt: new Date() } });
    return next;
  });

  app.get("/api/settings/editor", async (request) => getEditorSettings(context, request.userId));

  app.patch("/api/settings/editor", async (request) => {
    const input = parseWith(updateEditorSettingsInputSchema, request.body);
    const current = await getEditorSettings(context, request.userId);
    const next = editorSettingsSchema.parse({ ...current, ...input });
    await context.db
      .insert(editorSettings)
      .values({ userId: request.userId, ...next })
      .onConflictDoUpdate({
        target: editorSettings.userId,
        set: { ...next, updatedAt: new Date() },
      });
    return next;
  });

  app.get("/api/settings/openrouter", async (request) => {
    const credential = await getOpenRouterCredential(context, request.userId);
    return openRouterCredentialStatusSchema.parse({
      configured: Boolean(credential || context.env.OPENROUTER_API_KEY),
      source: credential ? "user" : context.env.OPENROUTER_API_KEY ? "server" : "none",
      lastFour: credential?.secretLastFour ?? (context.env.OPENROUTER_API_KEY.slice(-4) || null),
    });
  });

  app.put("/api/settings/openrouter", async (request, reply) => {
    const { apiKey } = parseWith(updateOpenRouterCredentialSchema, request.body);
    const validation = await fetch(`${context.env.OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => null);
    if (!validation?.ok) {
      return reply.code(400).send({
        error: {
          code: "INVALID_OPENROUTER_KEY",
          message:
            validation?.status === 401
              ? "OpenRouter rejected this API key. Check the key and try again."
              : "Asterism could not validate this key with OpenRouter. Try again shortly.",
        },
      });
    }
    await saveOpenRouterCredential(context, request.userId, apiKey);
    modelCache.delete(request.userId);
    return openRouterCredentialStatusSchema.parse({
      configured: true,
      source: "user",
      lastFour: apiKey.slice(-4),
    });
  });

  app.delete("/api/settings/openrouter", async (request, reply) => {
    await deleteOpenRouterCredential(context, request.userId);
    modelCache.delete(request.userId);
    return reply.code(204).send();
  });

  app.get("/api/models", async (request) => {
    return getModels(context, request.userId);
  });
}
