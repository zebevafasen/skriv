import { generateSceneSummaryInputSchema } from "@skriv/contracts";
import { protectedProtocolMessage, renderPrompt } from "@skriv/core";
import { scenes, touchUpdatedAt, usageEvents } from "@skriv/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownedScene } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getSettings } from "./settings.js";

const sceneParams = z.object({ id: z.uuid() });

export async function registerSummaryRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post(
    "/api/scenes/:id/summary/generate",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = parseWith(sceneParams, request.params);
      const input = parseWith(generateSceneSummaryInputSchema, request.body);
      const owned = await ownedScene(context, request.userId, id);
      if (!owned) return notFound(reply, "Scene not found.");
      if (owned.scene.version !== input.expectedVersion) {
        return conflict(reply, "Scene changed before summary generation began.", {
          currentVersion: owned.scene.version,
        });
      }
      if (!owned.scene.plainText.trim()) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Write some Scene prose before summarizing.",
          },
        });
      }

      const settings = await getSettings(context, request.userId);
      const prompt = await resolvePrompt(context, request.userId, "summary.scene");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let completion: {
        text: string;
        usage: { inputTokens: number | null; outputTokens: number | null };
      };
      try {
        const targetModel = input.modelOverride ?? settings.baseModel;
        completion = await (await context.getAi(request.userId, targetModel)).complete({
          model: targetModel,
          messages: [
            protectedProtocolMessage("summary.scene"),
            ...renderPrompt(prompt, {
              scene_title: owned.scene.title,
              scene_prose: owned.scene.plainText,
            }),
          ],
          maxOutputTokens: 700,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const summary = completion.text.trim();
      if (!summary) throw new Error("The summary model returned an empty response.");
      const [updated] = await context.db
        .update(scenes)
        .set({
          metadata: { ...owned.scene.metadata, summary },
          version: owned.scene.version + 1,
          ...touchUpdatedAt,
        })
        .where(and(eq(scenes.id, id), eq(scenes.version, input.expectedVersion)))
        .returning();
      if (!updated) return conflict(reply, "Scene changed while its summary was being generated.");

      await context.db.insert(usageEvents).values({
        userId: request.userId,
        projectId: owned.projectId,
        model: settings.baseModel,
        role: "summary",
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
      });
      return {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
  );
}
