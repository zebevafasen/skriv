import { createAIProvider } from "@skriv/ai";
import { AppError } from "@skriv/application";
import { loadServerEnv, type ServerEnv } from "@skriv/config";
import { validateBuiltinContent } from "@skriv/content";
import { createDatabase } from "@skriv/db";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { createAuth, ensureDevelopmentUser, registerAuth } from "./auth.js";
import type { AppContext } from "./context.js";
import { createProviderResolver } from "./credentials.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerArchiveTransferRoutes } from "./routes/archive-transfers.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerCompendiumRoutes } from "./routes/compendium.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerGenerationRoutes } from "./routes/generation.js";
import { registerIdeationRoutes } from "./routes/ideation.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerInviteRoutes } from "./routes/invites.js";
import { registerNoteRoutes } from "./routes/notes.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerPromptRoutes } from "./routes/prompts.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerSummaryRoutes } from "./routes/summaries.js";

export async function buildApp(env: ServerEnv = loadServerEnv()) {
  validateBuiltinContent();
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const auth = createAuth(db, env);
  const defaultAi =
    env.AI_PROVIDER === "fake" || env.OPENROUTER_API_KEY
      ? createAIProvider({
          provider: env.AI_PROVIDER,
          fakeDelayMs: env.FAKE_AI_DELAY_MS,
          apiKey: env.OPENROUTER_API_KEY,
          baseUrl: env.OPENROUTER_BASE_URL,
          appUrl: env.WEB_ORIGIN,
        })
      : null;
  const context: AppContext = {
    db,
    pool,
    env,
    auth: auth as AppContext["auth"],
    defaultAi,
    getAi: async () => {
      if (defaultAi) return defaultAi;
      throw new AppError("Configure OpenRouter in Settings.", "CREDENTIAL_ERROR");
    },
  };
  context.getAi = createProviderResolver(context);
  const app = Fastify({
    logger: { level: env.NODE_ENV === "test" ? "silent" : "info" },
    bodyLimit: 5 * 1024 * 1024,
    requestIdHeader: "x-request-id",
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    exposedHeaders: ["content-disposition"],
  });
  await app.register(sensible);
  await app.register(rateLimit, { global: false, max: 30, timeWindow: "1 minute" });
  await ensureDevelopmentUser(context);
  await registerAuth(app, context);

  app.get("/api/health", async () => ({
    status: "ok",
    provider: defaultAi?.name ?? "openrouter",
    contentPackage: "skriv.base",
  }));
  await registerProjectRoutes(app, context);
  await registerNoteRoutes(app, context);
  await registerCompendiumRoutes(app, context);
  await registerCategoryRoutes(app, context);
  await registerArchiveTransferRoutes(app, context);
  await registerChatRoutes(app, context);
  await registerPromptRoutes(app, context);
  await registerSettingsRoutes(app, context);
  await registerSetupRoutes(app, context);
  await registerGenerationRoutes(app, context);
  await registerSummaryRoutes(app, context);
  await registerIdeationRoutes(app, context);
  await registerInviteRoutes(app, context);
  await registerExportRoutes(app, context);
  await registerImportRoutes(app, context);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const status = error instanceof AppError
      ? ({
          BAD_REQUEST: 400,
          VALIDATION_ERROR: 400,
          UNAUTHORIZED: 401,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          CONFLICT: 409,
          CANCELLED: 409,
          RATE_LIMITED: 429,
          UNSUPPORTED: 501,
          PROVIDER_ERROR: 502,
          NETWORK_ERROR: 503,
          CREDENTIAL_ERROR: 400,
          DATABASE_ERROR: 500,
          FILE_ERROR: 500,
          INTERNAL_ERROR: 500,
        } as const)[error.code]
      : typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const code = error instanceof AppError
      ? error.code
      : status === 400
        ? "VALIDATION_ERROR"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : status === 404
              ? "NOT_FOUND"
              : status === 409
                ? "CONFLICT"
                : status === 429
                  ? "RATE_LIMITED"
                  : "INTERNAL_ERROR";
    const message = error instanceof Error ? error.message : "Request failed.";
    return reply.code(status).send({
      error: {
        code,
        message: status >= 500 ? "An unexpected server error occurred." : message,
        ...(error && typeof error === "object" && "details" in error
          ? { details: error.details }
          : {}),
        requestId: request.id,
      },
    });
  });

  app.addHook("onClose", async () => pool.end());
  return app;
}
