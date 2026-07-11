import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  acceptGenerationInputSchema,
  compendiumEntrySchema,
  type contextFragmentSchema,
  generationRequestSchema,
  generationStreamEventSchema,
} from "@asterism/contracts";
import {
  budgetFragments,
  discoverEntries,
  protectedProtocolMessage,
  renderPrompt,
  segmentEntry,
} from "@asterism/core";
import {
  compendiumEntries,
  generations,
  sceneRevisions,
  scenes,
  touchUpdatedAt,
  usageEvents,
} from "@asterism/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownedScene } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getSettings } from "./settings.js";

const generationParams = z.object({ id: z.uuid() });
const selectedFragmentsSchema = z.object({ selectedFragmentIds: z.array(z.string()).max(500) });
const activeControllers = new Map<string, AbortController>();
const contextCache = new Map<
  string,
  {
    expiresAt: number;
    value: { fragments: z.infer<typeof contextFragmentSchema>[]; fallback: boolean };
  }
>();

function ndjson(event: unknown): string {
  return `${JSON.stringify(event)}\n`;
}

async function assembleContext(
  context: AppContext,
  userId: string,
  input: z.infer<typeof generationRequestSchema>,
  projectId: string,
  scene: typeof scenes.$inferSelect,
) {
  const settings = await getSettings(context, userId);
  const rows = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  const entries = rows.map((entry) =>
    compendiumEntrySchema.parse({
      ...entry,
      singleton: entry.singletonKey !== null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }),
  );
  const before = input.manuscriptBeforeCursor.slice(-12_000);
  const after = input.manuscriptAfterCursor.slice(0, 2_000);
  const scanText = [
    before,
    after,
    scene.title,
    scene.metadata.summary,
    scene.metadata.goal,
    input.instructions,
    input.eventTarget,
  ]
    .filter(Boolean)
    .join("\n");
  const scenePresenceEntryIds = [
    scene.metadata.povEntryId,
    scene.metadata.locationEntryId,
    ...scene.metadata.presentCharacterEntryIds,
  ].filter((value): value is string => Boolean(value));
  const discovered = discoverEntries({
    entries,
    scanText,
    scenePresenceEntryIds,
    maxDepth: settings.recursionDepth,
    includeSmartCandidates: settings.smartContextEnabled,
  });
  const allFragments = discovered.flatMap(segmentEntry);
  const fixedCandidates = budgetFragments(
    allFragments.filter((fragment) => fragment.activationSource !== "smart"),
    8_000,
  );
  const smartCandidates = budgetFragments(
    allFragments.filter((fragment) => fragment.activationSource === "smart"),
    Math.max(
      0,
      8_000 -
        fixedCandidates.reduce(
          (sum, fragment) => sum + Math.ceil(fragment.text.length / 4) + 12,
          0,
        ),
    ),
  );
  if (!settings.smartContextEnabled || smartCandidates.length === 0) {
    return { fragments: fixedCandidates, fallback: false };
  }
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        sceneId: scene.id,
        sceneVersion: scene.version,
        scanText,
        workflow: input.workflow,
        eventTarget: input.eventTarget,
        instructions: input.instructions,
        model: settings.contextModel,
        recursionDepth: settings.recursionDepth,
        entries: rows.map((entry) => [entry.id, entry.revision]),
      }),
    )
    .digest("base64url");
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const extractionPrompt = await resolvePrompt(context, userId, "context.extract");
    const messages = [
      protectedProtocolMessage("context.extract"),
      ...renderPrompt(extractionPrompt, {
        request_context: scanText,
        candidate_fragments: smartCandidates
          .map((fragment) => `[fragment:${fragment.id}] ${fragment.text}`)
          .join("\n"),
      }),
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const result = await (await context.getAi(userId, settings.contextModel)).complete({
      model: settings.contextModel,
      messages,
      maxOutputTokens: 1_000,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const selected = selectedFragmentsSchema.parse(JSON.parse(result.text));
    const byId = new Map(smartCandidates.map((fragment) => [fragment.id, fragment]));
    const selectedSmart = selected.selectedFragmentIds
      .map((id) => byId.get(id))
      .filter((value): value is (typeof smartCandidates)[number] => Boolean(value));
    const fragments = budgetFragments([...fixedCandidates, ...selectedSmart], 8_000);
    await context.db.insert(usageEvents).values({
      userId,
      projectId,
      model: settings.contextModel,
      role: "context",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    const value = { fragments, fallback: false };
    if (contextCache.size >= 500) contextCache.delete(contextCache.keys().next().value ?? "");
    contextCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1_000, value });
    return value;
  } catch {
    return { fragments: fixedCandidates, fallback: true };
  }
}

function formatContext(fragments: z.infer<typeof contextFragmentSchema>[]): string {
  if (fragments.length === 0) return "No Compendium context was selected.";
  return fragments
    .map(
      (fragment) => `[Source: ${fragment.entryName}; Fragment: ${fragment.id}]\n${fragment.text}`,
    )
    .join("\n\n");
}

export async function registerGenerationRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post(
    "/api/generations",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = parseWith(generationRequestSchema, request.body);
      const owned = await ownedScene(context, request.userId, input.sceneId);
      if (!owned) return notFound(reply, "Scene not found.");
      const ownedRecord = owned;
      if (ownedRecord.scene.version !== input.sceneVersion) {
        return conflict(reply, "Scene changed since generation was configured.", {
          currentVersion: ownedRecord.scene.version,
        });
      }
      const settings = await getSettings(context, request.userId);
      const model = input.modelOverride ?? settings.baseModel;
      const prompt = await resolvePrompt(
        context,
        request.userId,
        input.workflow,
        input.promptOverrideId,
      );
      const { fragments, fallback } = await assembleContext(
        context,
        request.userId,
        input,
        ownedRecord.projectId,
        ownedRecord.scene,
      );
      const contextPackage = formatContext(fragments);
      const targetLength =
        input.targetLength === null
          ? "as much prose as the scene needs; there is no requested word or paragraph limit"
          : `${input.targetLength} ${input.lengthUnit}`;
      const messages = [
        protectedProtocolMessage(input.workflow),
        ...renderPrompt(prompt, {
          context_package: contextPackage,
          scene_context: [
            ownedRecord.scene.title,
            ownedRecord.scene.metadata.summary,
            ownedRecord.scene.metadata.goal,
          ]
            .filter(Boolean)
            .join("\n"),
          manuscript_before_cursor: input.manuscriptBeforeCursor,
          manuscript_after_cursor: input.manuscriptAfterCursor,
          event_target: input.eventTarget,
          user_instructions: input.instructions,
          target_length: targetLength,
        }),
      ];
      const [generation] = await context.db
        .insert(generations)
        .values({
          sceneId: input.sceneId,
          userId: request.userId,
          workflow: input.workflow,
          model,
          promptId: prompt.id,
          sceneVersion: input.sceneVersion,
          cursorPosition: input.cursorPosition,
          request: input,
          contextFallback: fallback,
        })
        .returning();
      if (!generation) throw new Error("Generation record creation failed.");
      const generationRecord = generation;
      const userId = request.userId;
      const controller = new AbortController();
      activeControllers.set(generationRecord.id, controller);
      request.raw.once("close", () => {
        if (!reply.sent) controller.abort();
      });

      async function* stream() {
        let sequence = 0;
        let candidateText = "";
        const started = generationStreamEventSchema.parse({
          type: "generation.started",
          generationId: generationRecord.id,
          sequence: sequence++,
          model,
          promptId: prompt.id,
        });
        yield ndjson(started);
        try {
          const maxOutputTokens =
            input.targetLength === null
              ? 16_000
              : Math.min(
                  16_000,
                  input.lengthUnit === "words"
                    ? Math.ceil(input.targetLength * 1.6)
                    : input.targetLength * 180,
                );
          for await (const delta of (await context.getAi(userId, model)).stream({
            model,
            messages,
            maxOutputTokens,
            signal: controller.signal,
          })) {
            candidateText += delta;
            yield ndjson(
              generationStreamEventSchema.parse({
                type: "generation.delta",
                generationId: generationRecord.id,
                sequence: sequence++,
                delta,
              }),
            );
          }
          const outputTokens = Math.ceil(candidateText.length / 4);
          await context.db
            .update(generations)
            .set({ candidateText, status: "completed", outputTokens, ...touchUpdatedAt })
            .where(eq(generations.id, generationRecord.id));
          await context.db.insert(usageEvents).values({
            userId,
            projectId: ownedRecord.projectId,
            generationId: generationRecord.id,
            model,
            role: "writing",
            outputTokens,
          });
          yield ndjson(
            generationStreamEventSchema.parse({
              type: "generation.completed",
              generationId: generationRecord.id,
              sequence: sequence++,
              candidateText,
              inputTokens: null,
              outputTokens,
              contextFallback: fallback,
            }),
          );
        } catch (error) {
          if (controller.signal.aborted) {
            await context.db
              .update(generations)
              .set({ status: "cancelled", ...touchUpdatedAt })
              .where(eq(generations.id, generationRecord.id));
            yield ndjson(
              generationStreamEventSchema.parse({
                type: "generation.cancelled",
                generationId: generationRecord.id,
                sequence: sequence++,
              }),
            );
          } else {
            const message = error instanceof Error ? error.message : "Generation failed.";
            await context.db
              .update(generations)
              .set({ status: "failed", failureMessage: message, ...touchUpdatedAt })
              .where(eq(generations.id, generationRecord.id));
            yield ndjson(
              generationStreamEventSchema.parse({
                type: "generation.failed",
                generationId: generationRecord.id,
                sequence: sequence++,
                message,
                retryable: true,
              }),
            );
          }
        } finally {
          activeControllers.delete(generationRecord.id);
        }
      }

      reply.header("Content-Type", "application/x-ndjson; charset=utf-8");
      reply.header("Cache-Control", "no-cache, no-transform");
      return reply.send(Readable.from(stream()));
    },
  );

  app.post("/api/generations/:id/cancel", async (request, reply) => {
    const { id } = parseWith(generationParams, request.params);
    const [generation] = await context.db
      .select()
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, request.userId)))
      .limit(1);
    if (!generation) return notFound(reply, "Generation not found.");
    activeControllers.get(id)?.abort();
    if (generation.status === "streaming") {
      await context.db
        .update(generations)
        .set({ status: "cancelled", ...touchUpdatedAt })
        .where(eq(generations.id, id));
    }
    return reply.code(204).send();
  });

  app.post("/api/generations/:id/reject", async (request, reply) => {
    const { id } = parseWith(generationParams, request.params);
    const [generation] = await context.db
      .select()
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, request.userId)))
      .limit(1);
    if (!generation) return notFound(reply, "Generation not found.");
    if (generation.status === "accepted")
      return conflict(reply, "An accepted generation cannot be rejected.");
    await context.db
      .update(generations)
      .set({ status: "rejected", ...touchUpdatedAt })
      .where(eq(generations.id, id));
    return reply.code(204).send();
  });

  app.post("/api/generations/:id/accept", async (request, reply) => {
    const { id } = parseWith(generationParams, request.params);
    const input = parseWith(acceptGenerationInputSchema, request.body);
    const [generation] = await context.db
      .select()
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, request.userId)))
      .limit(1);
    if (!generation) return notFound(reply, "Generation not found.");
    if (generation.status === "accepted") {
      const owned = await ownedScene(context, request.userId, generation.sceneId);
      return owned?.scene ?? notFound(reply, "Scene not found.");
    }
    if (generation.status !== "completed")
      return conflict(reply, "Only a completed generation can be accepted.");
    const owned = await ownedScene(context, request.userId, generation.sceneId);
    if (!owned) return notFound(reply, "Scene not found.");
    if (
      owned.scene.version !== input.expectedSceneVersion ||
      owned.scene.version !== generation.sceneVersion
    ) {
      return conflict(reply, "Scene changed after generation began.", {
        currentVersion: owned.scene.version,
      });
    }
    const updated = await context.db.transaction(async (tx) => {
      await tx.insert(sceneRevisions).values({
        sceneId: owned.scene.id,
        version: owned.scene.version,
        document: owned.scene.document,
        plainText: owned.scene.plainText,
        reason: "generation_accept",
        createdBy: request.userId,
      });
      const [scene] = await tx
        .update(scenes)
        .set({
          document: input.document,
          plainText: input.plainText,
          version: owned.scene.version + 1,
          ...touchUpdatedAt,
        })
        .where(and(eq(scenes.id, owned.scene.id), eq(scenes.version, input.expectedSceneVersion)))
        .returning();
      if (!scene) return null;
      await tx
        .update(generations)
        .set({ status: "accepted", ...touchUpdatedAt })
        .where(eq(generations.id, id));
      return scene;
    });
    if (!updated) return conflict(reply, "Scene changed while generation was accepted.");
    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}
