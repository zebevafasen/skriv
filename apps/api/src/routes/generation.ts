import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  acceptGenerationInputSchema,
  compendiumEntrySchema,
  type contextFragmentSchema,
  generationRequestSchema,
  generationStreamEventSchema,
  type PromptMessage,
} from "@skriv/contracts";
import {
  approximateTokens,
  budgetFragments,
  discoverEntries,
  protectedProtocolMessage,
  renderPrompt,
  segmentEntry,
} from "@skriv/core";
import {
  acts,
  chapters,
  compendiumEntries,
  generations,
  sceneRevisions,
  scenes,
  touchUpdatedAt,
  usageEvents,
} from "@skriv/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith, serializeNdjson } from "../http.js";
import { ownedScene } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getModelLimits, getSettings } from "./settings.js";

const generationParams = z.object({ id: z.uuid() });
const cancelGenerationInput = z
  .object({ candidateText: z.string().max(2_000_000).optional() })
  .default({});
const selectedFragmentsSchema = z.object({ selectedFragmentIds: z.array(z.string()).max(500) });
const activeControllers = new Map<string, AbortController>();
const DEFAULT_MODEL_CONTEXT_LENGTH = 32_768;
const DEFAULT_MODEL_COMPLETION_LIMIT = 16_384;
const MAX_AUTOMATIC_CONTINUATIONS = 3;
const MAX_TOTAL_AUTOMATIC_OUTPUT_TOKENS = 64_000;
const CONTINUATION_TAIL_CHARACTER_LIMIT = 16_000;
const CONTINUATION_BOUNDARY_BUFFER_SIZE = 512;
const MINIMUM_BOUNDARY_OVERLAP = 20;
const PARTIAL_PERSIST_CHARACTER_INTERVAL = 2_000;
const PARTIAL_PERSIST_TIME_INTERVAL_MS = 2_000;
const contextCache = new Map<
  string,
  {
    expiresAt: number;
    value: { fragments: z.infer<typeof contextFragmentSchema>[]; fallback: boolean };
  }
>();

export function proseContextRows<T extends { typeId: string }>(rows: T[]): T[] {
  return rows.filter(
    (entry) => entry.typeId !== "project.instructions" && entry.typeId !== "project.premise",
  );
}

export function firstSceneGenerationEligible(
  requestedSceneId: string,
  firstSceneId: string | undefined,
  currentPlainText: string,
): boolean {
  return requestedSceneId === firstSceneId && !currentPlainText.trim();
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
  const premiseEntry = rows.find((entry) => entry.typeId === "project.premise");
  const premise = premiseEntry?.content.kind === "text" ? premiseEntry.content.text.trim() : "";
  const entries = proseContextRows(rows).map((entry) =>
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
    input.workflow === "prose.first_scene" ? premise : "",
    before,
    "selectedText" in input ? input.selectedText : "",
    after,
    scene.metadata.summary,
    input.instructions,
    input.eventTarget,
  ]
    .filter(Boolean)
    .join("\n");
  const discovered = discoverEntries({
    entries,
    scanText,
    scenePresenceEntryIds: [],
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
    return { fragments: fixedCandidates, fallback: false, premise };
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
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, premise };

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
    return { ...value, premise };
  } catch {
    return { fragments: fixedCandidates, fallback: true, premise };
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

const SUMMARY_CONTEXT_LIMIT = 12_000;
const STYLE_REFERENCE_LIMIT = 12_000;

export function recentSummaryContext(summaries: string[]): string {
  const selected: string[] = [];
  let used = 0;
  for (const summary of summaries
    .map((value) => value.trim())
    .filter(Boolean)
    .reverse()) {
    const cost = summary.length + (selected.length > 0 ? 2 : 0);
    if (used + cost > SUMMARY_CONTEXT_LIMIT) break;
    selected.push(summary);
    used += cost;
  }
  return selected.reverse().join("\n\n");
}

export function proseOutputTokenBudget(
  messages: Array<{ content: string }>,
  contextLength: number,
  maxCompletionTokens: number,
  targetLength: number | null,
  lengthUnit: "words" | "paragraphs",
): number {
  const safeContextLength = Math.max(2_048, contextLength);
  const inputTokens = messages.reduce(
    (total, message) => total + approximateTokens(message.content) + 8,
    16,
  );
  const safetyTokens = Math.max(1_024, Math.ceil(safeContextLength * 0.05));
  const availableTokens = safeContextLength - inputTokens - safetyTokens;
  if (availableTokens < 128) {
    throw new Error(
      "The prompt leaves too little model context for prose. Reduce the included context or choose a model with a larger context window.",
    );
  }
  const requestedTokens =
    targetLength === null
      ? maxCompletionTokens
      : Math.min(
          maxCompletionTokens,
          lengthUnit === "words" ? Math.ceil(targetLength * 1.6) : targetLength * 180,
        );
  return Math.max(128, Math.min(requestedTokens, availableTokens, maxCompletionTokens));
}

export function continuationMessages(
  originalMessages: PromptMessage[],
  candidateText: string,
): PromptMessage[] {
  const sliced = candidateText.slice(-CONTINUATION_TAIL_CHARACTER_LIMIT);
  const firstParagraphBreak = sliced.indexOf("\n\n");
  const tail = firstParagraphBreak > 0 ? sliced.slice(firstParagraphBreak + 2) : sliced;
  return [
    ...originalMessages,
    { role: "assistant", content: tail },
    {
      role: "user",
      content:
        "Continue immediately after the previous prose. Do not recap, restart, or repeat its ending. " +
        "The original instructions remain authoritative: complete anything still outstanding, then stop at the next natural stopping point.",
    },
  ];
}

export function trimRepeatedBoundary(existing: string, incoming: string): string {
  const maximumOverlap = Math.min(2_000, existing.length, incoming.length);
  for (let length = maximumOverlap; length >= MINIMUM_BOUNDARY_OVERLAP; length -= 1) {
    if (existing.endsWith(incoming.slice(0, length))) return incoming.slice(length);
  }
  return incoming;
}

async function prosePlanningContext(
  context: AppContext,
  projectId: string,
  scene: typeof scenes.$inferSelect,
) {
  const orderedScenes = await context.db
    .select({ id: scenes.id, plainText: scenes.plainText, metadata: scenes.metadata })
    .from(scenes)
    .innerJoin(chapters, eq(chapters.id, scenes.chapterId))
    .innerJoin(acts, eq(acts.id, chapters.actId))
    .where(eq(acts.projectId, projectId))
    .orderBy(asc(acts.position), asc(chapters.position), asc(scenes.position));
  const currentIndex = orderedScenes.findIndex((candidate) => candidate.id === scene.id);
  const earlierScenes = currentIndex < 0 ? [] : orderedScenes.slice(0, currentIndex);
  return {
    currentSceneSummary: scene.metadata.summary.trim(),
    priorSceneSummaries: recentSummaryContext(
      earlierScenes.map((candidate) => candidate.metadata.summary),
    ),
    previousProse:
      earlierScenes
        .toReversed()
        .find((candidate) => candidate.plainText.trim())
        ?.plainText.trim()
        .slice(-STYLE_REFERENCE_LIMIT) ?? "",
  };
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
      if (input.workflow === "prose.first_scene") {
        const [firstScene] = await context.db
          .select({ id: scenes.id })
          .from(scenes)
          .innerJoin(chapters, eq(chapters.id, scenes.chapterId))
          .innerJoin(acts, eq(acts.id, chapters.actId))
          .where(eq(acts.projectId, ownedRecord.projectId))
          .orderBy(asc(acts.position), asc(chapters.position), asc(scenes.position))
          .limit(1);
        if (
          !firstSceneGenerationEligible(
            ownedRecord.scene.id,
            firstScene?.id,
            ownedRecord.scene.plainText,
          )
        ) {
          return reply.code(400).send({
            error: {
              code: "BAD_REQUEST",
              message: "First-scene generation requires the project's earliest Scene to be empty.",
            },
          });
        }
      }
      const settings = await getSettings(context, request.userId);
      const model = input.modelOverride ?? settings.baseModel;
      const prompt = await resolvePrompt(
        context,
        request.userId,
        input.workflow,
        input.promptOverrideId,
      );
      const { fragments, fallback, premise } = await assembleContext(
        context,
        request.userId,
        input,
        ownedRecord.projectId,
        ownedRecord.scene,
      );
      if (input.workflow === "prose.first_scene" && !premise) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "Choose and save a premise first." },
        });
      }
      const contextPackage = formatContext(fragments);
      const planningContext = await prosePlanningContext(
        context,
        ownedRecord.projectId,
        ownedRecord.scene,
      );
      const targetLength =
        input.targetLength === null
          ? "write until the next natural stopping point after fully satisfying the user instructions; do not target a word or paragraph count"
          : `${input.targetLength} ${input.lengthUnit}`;
      const selectionAction =
        input.workflow === "prose.revise_selection"
          ? {
              expand: "Expand the selection with meaningful detail while preserving its purpose.",
              shorten: "Shorten the selection without losing essential information or voice.",
              rephrase:
                "Rephrase the selection while preserving its meaning and approximate length.",
              polish: "Polish clarity, rhythm, grammar, and style without changing its meaning.",
              custom: "Follow the additional revision instructions exactly.",
            }[input.selectionAction]
          : "";

      let povCharacterName: string | null = null;
      if (ownedRecord.project.settings.povCharacterEntryId) {
        const [entry] = await context.db
          .select({ name: compendiumEntries.name })
          .from(compendiumEntries)
          .where(eq(compendiumEntries.id, ownedRecord.project.settings.povCharacterEntryId))
          .limit(1);
        if (entry) povCharacterName = entry.name;
      }

      const messages = [
        protectedProtocolMessage(input.workflow),
        ...renderPrompt(prompt, {
          premise,
          context_package: contextPackage,
          scene_title: ownedRecord.scene.title,
          scene_summary: ownedRecord.scene.metadata.summary,
          current_scene_summary: planningContext.currentSceneSummary,
          prior_scene_summaries: planningContext.priorSceneSummaries,
          style_reference_prose:
            input.manuscriptBeforeCursor.trim().slice(-STYLE_REFERENCE_LIMIT) ||
            planningContext.previousProse,
          manuscript_after_cursor: input.manuscriptAfterCursor.slice(0, 2_000),
          manuscript_before_selection: input.manuscriptBeforeCursor.slice(-2_000),
          selected_text: input.workflow === "prose.revise_selection" ? input.selectedText : "",
          manuscript_after_selection: input.manuscriptAfterCursor.slice(0, 2_000),
          selection_action: selectionAction,
          event_target: input.eventTarget,
          user_instructions: input.instructions,
          target_length: targetLength,
          story_tense: ownedRecord.project.settings.tense,
          story_language: ownedRecord.project.settings.language,
          story_pov: ownedRecord.project.settings.povType,
          pov_character: povCharacterName ?? "not separately configured",
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
        let lastPersistedLength = 0;
        let lastPersistedAt = Date.now();
        async function appendDelta(delta: string) {
          candidateText += delta;
          const now = Date.now();
          if (
            candidateText.length - lastPersistedLength >= PARTIAL_PERSIST_CHARACTER_INTERVAL ||
            now - lastPersistedAt >= PARTIAL_PERSIST_TIME_INTERVAL_MS
          ) {
            await context.db
              .update(generations)
              .set({ candidateText, ...touchUpdatedAt })
              .where(eq(generations.id, generationRecord.id));
            lastPersistedLength = candidateText.length;
            lastPersistedAt = now;
          }
          return serializeNdjson(
            generationStreamEventSchema.parse({
              type: "generation.delta",
              generationId: generationRecord.id,
              sequence: sequence++,
              delta,
            }),
          );
        }
        const started = generationStreamEventSchema.parse({
          type: "generation.started",
          generationId: generationRecord.id,
          sequence: sequence++,
          model,
          promptId: prompt.id,
        });
        yield serializeNdjson(started);
        try {
          let modelLimits = {
            contextLength: DEFAULT_MODEL_CONTEXT_LENGTH,
            maxCompletionTokens: DEFAULT_MODEL_COMPLETION_LIMIT,
          };
          try {
            const lookupSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]);
            modelLimits = await getModelLimits(context, userId, model, lookupSignal);
          } catch {
            controller.signal.throwIfAborted();
          }
          const totalOutputLimit = Math.max(
            MAX_TOTAL_AUTOMATIC_OUTPUT_TOKENS,
            modelLimits.maxCompletionTokens,
          );
          let continuation = 0;
          let passMessages = messages;
          while (true) {
            const remainingTotalTokens = totalOutputLimit - approximateTokens(candidateText);
            if (remainingTotalTokens < 128) {
              throw new Error(
                "Skriv reached the overall automatic writing safety limit. Your draft was preserved; accept it and continue writing from there.",
              );
            }
            const maxOutputTokens = Math.min(
              remainingTotalTokens,
              proseOutputTokenBudget(
                passMessages,
                modelLimits.contextLength,
                modelLimits.maxCompletionTokens,
                input.targetLength,
                input.lengthUnit,
              ),
            );
            let finishReason: string | null = null;
            let boundaryBuffer = "";
            let boundaryResolved = continuation === 0;
            for await (const chunk of (await context.getAi(userId, model)).stream({
              model,
              messages: passMessages,
              maxOutputTokens,
              signal: controller.signal,
            })) {
              if (chunk.finishReason) finishReason = chunk.finishReason;
              if (!chunk.text) continue;
              let delta = chunk.text;
              if (!boundaryResolved) {
                boundaryBuffer += delta;
                if (boundaryBuffer.length < CONTINUATION_BOUNDARY_BUFFER_SIZE) continue;
                delta = trimRepeatedBoundary(candidateText, boundaryBuffer);
                boundaryBuffer = "";
                boundaryResolved = true;
              }
              if (delta) yield await appendDelta(delta);
            }
            if (!boundaryResolved && boundaryBuffer) {
              const delta = trimRepeatedBoundary(candidateText, boundaryBuffer);
              if (delta) yield await appendDelta(delta);
            }
            if (finishReason !== "length") break;
            if (input.targetLength !== null) {
              throw new Error(
                "The model reached its output limit before the requested length. Your partial draft was preserved; accept it and continue writing from there.",
              );
            }
            if (continuation >= MAX_AUTOMATIC_CONTINUATIONS) {
              throw new Error(
                "The model reached its output limit after several automatic continuations. Your draft was preserved; accept it and continue writing from there.",
              );
            }
            continuation += 1;
            yield serializeNdjson(
              generationStreamEventSchema.parse({
                type: "generation.continuing",
                generationId: generationRecord.id,
                sequence: sequence++,
                continuation,
              }),
            );
            passMessages = continuationMessages(messages, candidateText);
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
          yield serializeNdjson(
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
              .set({ candidateText, status: "cancelled", ...touchUpdatedAt })
              .where(eq(generations.id, generationRecord.id));
            yield serializeNdjson(
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
              .set({ candidateText, status: "failed", failureMessage: message, ...touchUpdatedAt })
              .where(eq(generations.id, generationRecord.id));
            yield serializeNdjson(
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
    const input = parseWith(cancelGenerationInput, request.body ?? {});
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
        .set({
          status: "cancelled",
          ...(input.candidateText === undefined ? {} : { candidateText: input.candidateText }),
          ...touchUpdatedAt,
        })
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
    if (
      generation.status !== "completed" &&
      !(["failed", "cancelled"].includes(generation.status) && generation.candidateText.trim())
    ) {
      return conflict(
        reply,
        "Only a completed generation or a preserved partial draft can be accepted.",
      );
    }
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
