import { AppError } from "@skriv/application";
import { basePackage, getBuiltinPrompt } from "@skriv/content";
import {
  acceptGenerationInputSchema,
  generationRequestSchema,
  type GenerationRequest,
  type GenerationStreamEvent,
  type PromptDefinition,
} from "@skriv/contracts";
import { protectedProtocolMessage, renderPrompt } from "@skriv/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { LocalDatabase } from "./database.js";
import { cancelNativeAi, streamNativeAi } from "./native-ai.js";
import {
  acts,
  aiSettings,
  chapters,
  compendiumEntries,
  generations,
  projects,
  promptDefinitions,
  sceneRevisions,
  scenes,
  touchUpdatedAt,
  workflowBindings,
} from "./schema.js";

const cancelInputSchema = z.object({ candidateText: z.string().max(2_000_000).optional() });

function notFound(message: string): never {
  throw new AppError(message, "NOT_FOUND");
}

function conflict(message: string, details?: unknown): never {
  throw new AppError(message, "CONFLICT", details);
}

async function resolvePrompt(
  db: LocalDatabase,
  workflow: GenerationRequest["workflow"],
  overrideId: string | null,
): Promise<PromptDefinition> {
  if (overrideId) {
    const builtin = basePackage.prompts.find(
      (prompt) => prompt.id === overrideId && prompt.workflow === workflow,
    );
    if (builtin) return builtin;
    const [custom] = await db
      .select()
      .from(promptDefinitions)
      .where(and(eq(promptDefinitions.id, overrideId), eq(promptDefinitions.workflow, workflow)))
      .limit(1);
    if (!custom) throw new AppError("Prompt override is missing or incompatible.", "BAD_REQUEST");
    return { ...custom, ownership: "user" };
  }
  const [binding] = await db
    .select()
    .from(workflowBindings)
    .where(eq(workflowBindings.workflow, workflow))
    .limit(1);
  if (binding?.promptDefinitionId) {
    const [custom] = await db
      .select()
      .from(promptDefinitions)
      .where(eq(promptDefinitions.id, binding.promptDefinitionId))
      .limit(1);
    if (custom && custom.workflow === workflow) return { ...custom, ownership: "user" };
  }
  if (binding?.builtinPromptId) {
    const builtin = basePackage.prompts.find(
      (prompt) => prompt.id === binding.builtinPromptId && prompt.workflow === workflow,
    );
    if (builtin) return builtin;
  }
  return getBuiltinPrompt(workflow);
}

async function generationContext(db: LocalDatabase, input: GenerationRequest) {
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, input.sceneId)).limit(1);
  if (!scene) notFound("Scene not found.");
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, scene.chapterId))
    .limit(1);
  if (!chapter) notFound("Chapter not found.");
  const [act] = await db.select().from(acts).where(eq(acts.id, chapter.actId)).limit(1);
  if (!act) notFound("Act not found.");
  const [project] = await db.select().from(projects).where(eq(projects.id, act.projectId)).limit(1);
  if (!project) notFound("Project not found.");
  if (scene.version !== input.sceneVersion) {
    conflict("Scene changed since generation was configured.", { currentVersion: scene.version });
  }

  const actRows = await db
    .select()
    .from(acts)
    .where(eq(acts.projectId, project.id))
    .orderBy(asc(acts.position));
  const chapterRows = actRows.length
    ? await db
        .select()
        .from(chapters)
        .where(
          inArray(
            chapters.actId,
            actRows.map((item) => item.id),
          ),
        )
        .orderBy(asc(chapters.position))
    : [];
  const sceneRows = chapterRows.length
    ? await db
        .select()
        .from(scenes)
        .where(
          inArray(
            scenes.chapterId,
            chapterRows.map((item) => item.id),
          ),
        )
        .orderBy(asc(scenes.position))
    : [];
  const orderedScenes = actRows.flatMap((actRow) =>
    chapterRows
      .filter((chapterRow) => chapterRow.actId === actRow.id)
      .flatMap((chapterRow) =>
        sceneRows.filter((sceneRow) => sceneRow.chapterId === chapterRow.id),
      ),
  );
  const sceneIndex = orderedScenes.findIndex((item) => item.id === scene.id);
  if (input.workflow === "prose.first_scene" && (sceneIndex !== 0 || scene.plainText.trim())) {
    throw new AppError(
      "First-scene generation requires the project's earliest Scene to be empty.",
      "BAD_REQUEST",
    );
  }
  const entries = await db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, project.id));
  const premiseEntry = entries.find((entry) => entry.singletonKey === "premise");
  const premise = premiseEntry?.content.kind === "text" ? premiseEntry.content.text.trim() : "";
  if (input.workflow === "prose.first_scene" && !premise) {
    throw new AppError("Choose and save a premise first.", "BAD_REQUEST");
  }
  const contextPackage = entries
    .filter((entry) => entry.activationMode !== "never")
    .map((entry) => `${entry.name} (${entry.typeId}): ${JSON.stringify(entry.content)}`)
    .join("\n");
  const prior = orderedScenes.slice(0, Math.max(0, sceneIndex));
  const priorSceneSummaries = prior
    .filter((item) => item.metadata.summary.trim())
    .slice(-8)
    .map((item) => `- ${item.title || "Untitled Scene"}: ${item.metadata.summary}`)
    .join("\n");
  const previousProse = prior.toReversed().find((item) => item.plainText.trim())?.plainText ?? "";
  const povName = project.settings.povCharacterEntryId
    ? (entries.find((entry) => entry.id === project.settings.povCharacterEntryId)?.name ?? "")
    : "";
  return {
    scene,
    project,
    premise,
    contextPackage,
    priorSceneSummaries,
    previousProse,
    povName,
  };
}

export async function streamLocalGeneration(
  db: LocalDatabase,
  rawInput: GenerationRequest,
  onEvent: (event: GenerationStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const input = generationRequestSchema.parse(rawInput);
  const context = await generationContext(db, input);
  const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
  const model = input.modelOverride ?? settings?.baseModel ?? "openrouter/auto";
  const prompt = await resolvePrompt(db, input.workflow, input.promptOverrideId);
  const targetLength =
    input.targetLength === null
      ? "Continue until the next natural stopping point."
      : `${input.targetLength} ${input.lengthUnit}`;
  const selectionAction =
    input.workflow === "prose.revise_selection"
      ? {
          expand: "Expand the selection while preserving its purpose.",
          shorten: "Shorten the selection without losing essential meaning.",
          rephrase: "Rephrase while preserving meaning and approximate length.",
          polish: "Polish clarity, rhythm, grammar, and style.",
          custom: "Follow the supplied revision instructions exactly.",
        }[input.selectionAction]
      : "";
  const messages = [
    protectedProtocolMessage(input.workflow),
    ...renderPrompt(prompt, {
      premise: context.premise,
      context_package: context.contextPackage,
      scene_title: context.scene.title,
      scene_summary: context.scene.metadata.summary,
      current_scene_summary: context.scene.metadata.summary,
      prior_scene_summaries: context.priorSceneSummaries,
      style_reference_prose:
        input.manuscriptBeforeCursor.trim().slice(-4_000) || context.previousProse.slice(-4_000),
      manuscript_after_cursor: input.manuscriptAfterCursor.slice(0, 2_000),
      manuscript_before_selection: input.manuscriptBeforeCursor.slice(-2_000),
      selected_text: input.workflow === "prose.revise_selection" ? input.selectedText : "",
      manuscript_after_selection: input.manuscriptAfterCursor.slice(0, 2_000),
      selection_action: selectionAction,
      event_target: input.eventTarget,
      user_instructions: input.instructions,
      target_length: targetLength,
      story_tense: context.project.settings.tense,
      story_language: context.project.settings.language,
      story_pov: context.project.settings.povType,
      pov_character: context.povName,
    }),
  ];
  const generationId = crypto.randomUUID();
  await db.insert(generations).values({
    id: generationId,
    sceneId: context.scene.id,
    workflow: input.workflow,
    model,
    promptId: prompt.id,
    sceneVersion: context.scene.version,
    cursorPosition: input.cursorPosition,
    request: { ...input },
  });
  let sequence = 0;
  let candidateText = "";
  onEvent({
    type: "generation.started",
    generationId,
    sequence: sequence++,
    model,
    promptId: prompt.id,
  });
  try {
    const completion = await streamNativeAi(
      {
        operationId: generationId,
        model,
        messages,
        ...(input.targetLength
          ? { maxTokens: Math.min(16_384, Math.max(512, input.targetLength * 3)) }
          : {}),
      },
      (event) => {
        candidateText += event.delta;
        onEvent({
          type: "generation.delta",
          generationId,
          sequence: sequence++,
          delta: event.delta,
        });
      },
      signal,
    );
    await db
      .update(generations)
      .set({
        status: "completed",
        candidateText,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        ...touchUpdatedAt,
      })
      .where(eq(generations.id, generationId));
    onEvent({
      type: "generation.completed",
      generationId,
      sequence: sequence++,
      candidateText,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      contextFallback: false,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      await db
        .update(generations)
        .set({ status: "cancelled", candidateText, ...touchUpdatedAt })
        .where(eq(generations.id, generationId));
      onEvent({ type: "generation.cancelled", generationId, sequence: sequence++ });
      return;
    }
    const message = error instanceof Error ? error.message : "Generation failed.";
    await db
      .update(generations)
      .set({ status: "failed", candidateText, failureMessage: message, ...touchUpdatedAt })
      .where(eq(generations.id, generationId));
    onEvent({
      type: "generation.failed",
      generationId,
      sequence: sequence++,
      message,
      retryable: error instanceof AppError ? error.retryable : false,
    });
  }
}

export async function handleGenerationRoutes(
  db: LocalDatabase,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown | null> {
  const match = path.match(/^\/api\/generations\/([0-9a-f-]+)\/(accept|reject|cancel)$/i);
  if (!match || method !== "POST") return null;
  const generationId = match[1] as string;
  const action = match[2];
  const [generation] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, generationId))
    .limit(1);
  if (!generation) notFound("Generation not found.");

  if (action === "cancel") {
    const input = cancelInputSchema.parse(body);
    await cancelNativeAi(generation.id);
    if (generation.status === "streaming") {
      await db
        .update(generations)
        .set({
          status: "cancelled",
          ...(input.candidateText === undefined ? {} : { candidateText: input.candidateText }),
          ...touchUpdatedAt,
        })
        .where(eq(generations.id, generation.id));
    }
    return undefined;
  }
  if (action === "reject") {
    if (generation.status === "accepted") conflict("An accepted generation cannot be rejected.");
    await db
      .update(generations)
      .set({ status: "rejected", ...touchUpdatedAt })
      .where(eq(generations.id, generation.id));
    return undefined;
  }

  const input = acceptGenerationInputSchema.parse(body);
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, generation.sceneId)).limit(1);
  if (!scene) notFound("Scene not found.");
  if (generation.status === "accepted") return scene;
  if (
    generation.status !== "completed" &&
    !(["failed", "cancelled"].includes(generation.status) && generation.candidateText.trim())
  ) {
    conflict("Only a completed generation or preserved partial draft can be accepted.");
  }
  if (scene.version !== input.expectedSceneVersion || scene.version !== generation.sceneVersion) {
    conflict("Scene changed after generation began.", { currentVersion: scene.version });
  }
  const updated = await db.transaction(async (tx) => {
    await tx.insert(sceneRevisions).values({
      id: crypto.randomUUID(),
      sceneId: scene.id,
      version: scene.version,
      document: scene.document,
      plainText: scene.plainText,
      reason: "generation_accept",
    });
    const [saved] = await tx
      .update(scenes)
      .set({
        document: input.document,
        plainText: input.plainText,
        version: scene.version + 1,
        ...touchUpdatedAt,
      })
      .where(and(eq(scenes.id, scene.id), eq(scenes.version, input.expectedSceneVersion)))
      .returning();
    if (!saved) conflict("Scene changed while generation was accepted.");
    await tx
      .update(generations)
      .set({ status: "accepted", ...touchUpdatedAt })
      .where(eq(generations.id, generation.id));
    return saved;
  });
  return updated;
}
