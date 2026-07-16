import { basePackage } from "@skriv/content";
import {
  compendiumEntrySchema,
  compendiumContentSchema,
  compendiumTypeIdSchema,
  type CompendiumContent,
  extractedCompendiumDraftSchema,
  extractCompendiumInputSchema,
  extractCompendiumResponseSchema,
  importExtractedCompendiumInputSchema,
  importExtractedCompendiumResponseSchema,
  type PromptDefinition,
  type PromptMessage,
  workflowKeySchema,
} from "@skriv/contracts";
import {
  approximateTokens,
  discoverReferences,
  findTemplateVariables,
  normalizeCompendiumContent,
  protectedProtocolMessage,
  renderPrompt,
} from "@skriv/core";
import {
  compendiumCategories,
  compendiumEntries,
  packageSettings,
  projects,
  touchUpdatedAt,
  usageEvents,
  userCollections,
  userDefinitions,
} from "@skriv/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getSettings } from "./settings.js";

const projectParams = z.object({ projectId: z.uuid() });
const ingredientValueSchema = z.object({
  definitionId: z.string().nullable(),
  label: z.string().min(1),
  locked: z.boolean().default(false),
});
const metadataUpdateSchema = z.object({
  premise: z.string().max(50_000).optional(),
  genres: z.array(ingredientValueSchema).optional(),
  themes: z.array(ingredientValueSchema).optional(),
  tags: z.array(ingredientValueSchema).optional(),
});
const draftIngredientsSchema = z.object({
  genres: z.array(ingredientValueSchema).optional(),
  themes: z.array(ingredientValueSchema).optional(),
  tags: z.array(ingredientValueSchema).optional(),
  contextEntryIds: z.array(z.uuid()).max(100).default([]),
});
const premiseRequestSchema = draftIngredientsSchema.extend({
  mode: z.literal("premise").optional().default("premise"),
  instructions: z.string().max(20_000).default(""),
  modelOverride: z.string().nullable().default(null),
  count: z.number().int().min(1).max(5).default(3),
});
const entityRequestSchema = draftIngredientsSchema.extend({
  mode: z.literal("entity"),
  typeId: compendiumTypeIdSchema.refine(
    (value) => !value.startsWith("project."),
    "Choose a story category.",
  ),
  instructions: z.string().max(20_000).default(""),
  modelOverride: z.string().nullable().default(null),
  count: z.number().int().min(1).max(5).default(3),
});
const generateRequestSchema = z.union([entityRequestSchema, premiseRequestSchema]);
const extractionResultSchema = z.object({
  entries: z.array(extractedCompendiumDraftSchema).max(30),
});
const IDEATION_CONTEXT_TOKEN_BUDGET = 8_000;
const collectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["genre", "theme", "tag"]),
  values: z.array(z.object({ definitionId: z.string().nullable(), label: z.string().min(1) })),
});
const definitionSchema = z.object({
  kind: z.enum(["genre", "theme", "tag"]),
  label: z.string().trim().min(1).max(120),
});

export function normalizedEntryName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

export function existingEntryNames<T extends { id: string; name: string; aliases: string[] }>(
  entries: T[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const entry of entries) {
    for (const candidate of [entry.name, ...entry.aliases]) {
      result.set(normalizedEntryName(candidate), entry);
    }
  }
  return result;
}

export function parseCompendiumExtraction(value: string) {
  const withoutReasoning = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutReasoning.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const firstBrace = withoutReasoning.indexOf("{");
  const lastBrace = withoutReasoning.lastIndexOf("}");
  const embedded =
    firstBrace >= 0 && lastBrace > firstBrace
      ? withoutReasoning.slice(firstBrace, lastBrace + 1)
      : null;
  const candidates = [withoutReasoning, fenced, embedded].filter(
    (candidate, index, all): candidate is string =>
      Boolean(candidate) && all.indexOf(candidate) === index,
  );
  let lastError: unknown = new Error("No JSON object was found in the model response.");
  for (const candidate of candidates) {
    try {
      return extractionResultSchema.parse(JSON.parse(candidate));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function richTextContent(text: string) {
  return {
    kind: "rich_text" as const,
    plainText: text,
    document: {
      type: "doc",
      content: text.split(/\r?\n/).map((line) => ({
        type: "paragraph",
        ...(line ? { content: [{ type: "text", text: line }] } : {}),
      })),
    },
  };
}

export function appendCompendiumContent(
  content: CompendiumContent,
  appendedText: string,
): CompendiumContent {
  const text = appendedText.trim();
  if (content.kind === "text") {
    return { kind: "text", text: [content.text.trimEnd(), text].filter(Boolean).join("\n\n") };
  }
  const existingText = normalizeCompendiumContent(content).trimEnd();
  const appended = richTextContent(text);
  if (content.kind === "selection") {
    return richTextContent([existingText, text].filter(Boolean).join("\n\n"));
  }
  return {
    kind: "rich_text",
    plainText: [existingText, text].filter(Boolean).join("\n\n"),
    document: {
      ...content.document,
      type: content.document.type ?? "doc",
      content: [
        ...(existingText ? (content.document.content ?? []) : []),
        ...(appended.document.content ?? []),
      ],
    },
  };
}

function ideationEntryResponse(entry: typeof compendiumEntries.$inferSelect) {
  return compendiumEntrySchema.parse({
    ...entry,
    singleton: entry.singletonKey !== null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
}

async function metadataEntries(context: AppContext, projectId: string) {
  const rows = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  return new Map(
    rows.filter((row) => row.singletonKey).map((row) => [row.singletonKey as string, row]),
  );
}

function truncateContextBlock(block: string, tokenLimit: number): string {
  if (approximateTokens(block) <= tokenLimit) return block;
  const marker = "\n\n[Truncated to fit the Ideation context budget]";
  const characterLimit = Math.max(0, tokenLimit * 4 - marker.length);
  return `${block.slice(0, characterLimit).trimEnd()}${marker}`;
}

export function formatIdeationContext(
  references: ReturnType<typeof discoverReferences>,
  tokenBudget = IDEATION_CONTEXT_TOKEN_BUDGET,
): string {
  if (references.length === 0) return "No Compendium reference material was selected.";
  const roots = references.filter((reference) => reference.recursionDepth === 0);
  const recursive = references.filter((reference) => reference.recursionDepth > 0);
  const blocks: string[] = [];
  let remaining = tokenBudget;

  const format = (reference: (typeof references)[number]) =>
    [
      "----- CANONICAL COMPENDIUM REFERENCE -----",
      `[Entry Name: ${reference.entry.name}]`,
      `[Entry Type: ${reference.entry.typeId}]`,
      `[Reference Source: ${reference.referenceSource}]`,
      `[Recursion Depth: ${reference.recursionDepth}]`,
      "",
      normalizeCompendiumContent(reference.entry.content),
      "----- END COMPENDIUM REFERENCE -----",
    ].join("\n");

  roots.forEach((reference, index) => {
    const rootsLeft = roots.length - index;
    const share = Math.max(1, Math.floor(remaining / rootsLeft));
    const block = truncateContextBlock(format(reference), share);
    blocks.push(block);
    remaining = Math.max(0, remaining - approximateTokens(block));
  });
  for (const reference of recursive) {
    if (remaining <= 0) break;
    const block = format(reference);
    if (approximateTokens(block) <= remaining) {
      blocks.push(block);
      remaining -= approximateTokens(block);
    } else if (remaining >= 64) {
      blocks.push(truncateContextBlock(block, remaining));
      remaining = 0;
    }
  }
  return blocks.join("\n\n");
}

export function ideationPromptMessages(
  workflow: "ideation.premise" | "ideation.entity",
  prompt: PromptDefinition,
  values: Record<string, string>,
  selectedContext: string,
): PromptMessage[] {
  const promptUsesContext = prompt.messages.some((message) =>
    findTemplateVariables(message.content).includes("selected_context"),
  );
  const fallback: PromptMessage[] = promptUsesContext
    ? []
    : [
        {
          role: "developer",
          content: [
            "Treat the following Compendium material as canonical reference facts, not as creative direction.",
            "Do not contradict, rename, or silently revise it.",
            "",
            selectedContext,
          ].join("\n"),
        },
      ];
  return [
    protectedProtocolMessage(workflow),
    ...fallback,
    ...renderPrompt(prompt, { ...values, selected_context: selectedContext }),
  ];
}

export function hasInvalidIdeationReferenceIds(
  requestedIds: string[],
  availableIds: Iterable<string>,
): boolean {
  const available = new Set(availableIds);
  return (
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((id) => !available.has(id))
  );
}

export async function registerIdeationRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/ideation/definitions", async (request) => {
    const [setting] = await context.db
      .select()
      .from(packageSettings)
      .where(
        and(
          eq(packageSettings.userId, request.userId),
          eq(packageSettings.packageId, basePackage.id),
        ),
      )
      .limit(1);
    const collections = await context.db
      .select()
      .from(userCollections)
      .where(eq(userCollections.userId, request.userId));
    const customDefinitions = await context.db
      .select()
      .from(userDefinitions)
      .where(eq(userDefinitions.userId, request.userId));
    return {
      package: basePackage,
      enabled: setting?.enabled ?? true,
      collections,
      customDefinitions,
    };
  });

  app.post("/api/ideation/definitions", async (request, reply) => {
    const input = parseWith(definitionSchema, request.body);
    const normalizedLabel = input.label.normalize("NFKC").toLocaleLowerCase();
    const [definition] = await context.db
      .insert(userDefinitions)
      .values({ userId: request.userId, ...input, normalizedLabel })
      .onConflictDoUpdate({
        target: [userDefinitions.userId, userDefinitions.kind, userDefinitions.normalizedLabel],
        set: { label: input.label, updatedAt: new Date() },
      })
      .returning();
    return reply.code(201).send(definition);
  });

  app.put("/api/ideation/base-package", async (request, reply) => {
    const { enabled } = parseWith(z.object({ enabled: z.boolean() }), request.body);
    await context.db
      .insert(packageSettings)
      .values({ userId: request.userId, packageId: basePackage.id, enabled })
      .onConflictDoUpdate({
        target: [packageSettings.userId, packageSettings.packageId],
        set: { enabled, updatedAt: new Date() },
      });
    return reply.code(204).send();
  });

  app.post("/api/ideation/collections", async (request, reply) => {
    const input = parseWith(collectionSchema, request.body);
    const [created] = await context.db
      .insert(userCollections)
      .values({ userId: request.userId, ...input })
      .returning();
    return reply.code(201).send(created);
  });

  app.get("/api/projects/:projectId/ideation", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const entries = await metadataEntries(context, projectId);
    return Object.fromEntries(
      ["premise", "genres", "themes", "tags"].map((key) => [
        key,
        entries.get(key)?.content ?? null,
      ]),
    );
  });

  app.patch("/api/projects/:projectId/ideation", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(metadataUpdateSchema, request.body);
    const entries = await metadataEntries(context, projectId);
    await context.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(input)) {
        const entry = entries.get(key);
        if (!entry || value === undefined) continue;
        const content = compendiumContentSchema.parse(
          key === "premise" ? { kind: "text", text: value } : { kind: "selection", values: value },
        );
        if (JSON.stringify(content) === JSON.stringify(entry.content)) continue;
        await tx
          .update(compendiumEntries)
          .set({ content, revision: entry.revision + 1, ...touchUpdatedAt })
          .where(eq(compendiumEntries.id, entry.id));
      }
    });
    return reply.code(204).send();
  });

  app.post("/api/projects/:projectId/ideation/extract-compendium", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(extractCompendiumInputSchema, request.body ?? {});
    const entries = await metadataEntries(context, projectId);
    const premiseEntry = entries.get("premise");
    const premise = premiseEntry?.content.kind === "text" ? premiseEntry.content.text.trim() : "";
    if (!premiseEntry || !premise) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Choose and save a premise before extracting entries.",
        },
      });
    }
    const [project] = await context.db
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return notFound(reply, "Project not found.");
    const settings = await getSettings(context, request.userId);
    const prompt = await resolvePrompt(
      context,
      request.userId,
      workflowKeySchema.enum["ideation.compendium_extract"],
    );
    const model = input.modelOverride ?? settings.baseModel;
    const result = await (await context.getAi(request.userId, model)).complete({
      model,
      maxOutputTokens: 4_000,
      messages: [
        protectedProtocolMessage("ideation.compendium_extract"),
        ...renderPrompt(prompt, {
          premise,
          story_language: project.settings.language,
        }),
      ],
    });
    let extracted: z.infer<typeof extractionResultSchema>;
    try {
      extracted = parseCompendiumExtraction(result.text);
    } catch (error) {
      request.log.warn({ err: error }, "Invalid Compendium extraction response");
      return reply.code(502).send({
        error: {
          code: "INVALID_AI_RESPONSE",
          message:
            "The model returned an invalid Compendium extraction. Try again or choose another model.",
        },
      });
    }
    const existingRows = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));
    const duplicateByName = existingEntryNames(
      existingRows.filter((entry) => entry.singletonKey === null),
    );
    const seen = new Set<string>();
    const suggestions = extracted.entries.flatMap((entry) => {
      const normalized = normalizedEntryName(entry.name);
      if (seen.has(normalized)) return [];
      seen.add(normalized);
      const duplicate = duplicateByName.get(normalized) ?? null;
      return [
        {
          ...entry,
          id: crypto.randomUUID(),
          duplicateEntryId: duplicate?.id ?? null,
          duplicateEntryRevision: duplicate?.revision ?? null,
        },
      ];
    });
    await context.db.insert(usageEvents).values({
      userId: request.userId,
      projectId,
      model,
      role: "ideation",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return extractCompendiumResponseSchema.parse({
      sourcePremiseRevision: premiseEntry.revision,
      suggestions,
      model,
      promptId: prompt.id,
    });
  });

  app.post("/api/projects/:projectId/ideation/import-compendium", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(importExtractedCompendiumInputSchema, request.body);
    const allEntries = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));
    const premiseEntry = allEntries.find((entry) => entry.singletonKey === "premise");
    if (!premiseEntry || premiseEntry.revision !== input.sourcePremiseRevision) {
      return reply.code(409).send({
        error: {
          code: "CONFLICT",
          message: "The premise changed after these entries were extracted. Run extraction again.",
        },
      });
    }
    const regularEntries = allEntries.filter((entry) => entry.singletonKey === null);
    const occupied = existingEntryNames(regularEntries);
    const byId = new Map(regularEntries.map((entry) => [entry.id, entry]));
    const incoming = new Set<string>();
    const appendTargets = new Set<string>();
    const conflicts = input.entries.flatMap((entry) => {
      const normalized = normalizedEntryName(entry.name);
      const matched = occupied.get(normalized) ?? null;
      const repeated = incoming.has(normalized);
      incoming.add(normalized);
      if (entry.existingEntryId && entry.expectedExistingRevision) {
        const target = byId.get(entry.existingEntryId);
        const repeatedTarget = appendTargets.has(entry.existingEntryId);
        appendTargets.add(entry.existingEntryId);
        if (
          !target ||
          target.revision !== entry.expectedExistingRevision ||
          matched?.id !== target.id ||
          repeated ||
          repeatedTarget
        ) {
          return [{ name: entry.name, existingEntryId: entry.existingEntryId }];
        }
        return [];
      }
      return matched || repeated
        ? [{ name: entry.name, existingEntryId: matched?.id ?? null }]
        : [];
    });
    if (conflicts.length) {
      return reply.code(409).send({
        error: {
          code: "CONFLICT",
          message:
            "One or more destination entries changed. Run extraction again before importing.",
          details: conflicts,
        },
      });
    }
    const imported = await context.db.transaction(async (tx) => {
      const results = [];
      for (const entry of input.entries) {
        if (entry.existingEntryId && entry.expectedExistingRevision) {
          const existing = byId.get(entry.existingEntryId);
          if (!existing) throw new Error("Compendium entry not found.");
          const [updated] = await tx
            .update(compendiumEntries)
            .set({
              content: appendCompendiumContent(existing.content, entry.description),
              revision: existing.revision + 1,
              ...touchUpdatedAt,
            })
            .where(
              and(
                eq(compendiumEntries.id, existing.id),
                eq(compendiumEntries.revision, entry.expectedExistingRevision),
              ),
            )
            .returning();
          if (!updated) {
            throw Object.assign(new Error("Compendium entry changed while it was being updated."), {
              statusCode: 409,
            });
          }
          results.push(ideationEntryResponse(updated));
          continue;
        }
        const [created] = await tx
          .insert(compendiumEntries)
          .values({
            projectId,
            name: entry.name,
            typeId: entry.typeId,
            aliases: [],
            labels: [],
            trackingEnabled: true,
            matchExclusions: [],
            activationMode: "mention",
            caseSensitive: false,
            content: richTextContent(entry.description),
          })
          .returning();
        if (!created) throw new Error("Compendium entry creation failed.");
        results.push(ideationEntryResponse(created));
      }
      return results;
    });
    return reply.code(201).send(importExtractedCompendiumResponseSchema.parse(imported));
  });

  app.post("/api/projects/:projectId/ideation/generate", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(generateRequestSchema, request.body ?? {});
    const entries = await metadataEntries(context, projectId);
    const labels = (key: "genres" | "themes" | "tags") => {
      const draft = input[key];
      if (draft) return draft.map((value) => value.label).join(", ");
      const content = entries.get(key)?.content;
      return content?.kind === "selection"
        ? content.values.map((value) => value.label).join(", ")
        : "";
    };
    const settings = await getSettings(context, request.userId);
    const referenceRows = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));
    const referenceEntries = referenceRows
      .filter((entry) => entry.singletonKey === null)
      .map((entry) =>
        compendiumEntrySchema.parse({
          ...entry,
          singleton: false,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        }),
      );
    if (
      hasInvalidIdeationReferenceIds(
        input.contextEntryIds,
        referenceEntries.map((entry) => entry.id),
      )
    ) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "One or more context entries were not found." },
      });
    }
    const selectedContext = formatIdeationContext(
      discoverReferences({
        entries: referenceEntries,
        scanText: input.instructions,
        pinnedEntryIds: input.contextEntryIds,
        maxDepth: settings.recursionDepth,
      }),
    );
    if (input.mode === "entity") {
      let category = input.typeId.replace("story.", "");
      if (input.typeId.startsWith("custom.")) {
        const categoryId = input.typeId.slice(7);
        const [custom] = await context.db
          .select()
          .from(compendiumCategories)
          .where(
            and(
              eq(compendiumCategories.id, categoryId),
              eq(compendiumCategories.projectId, projectId),
            ),
          )
          .limit(1);
        if (!custom)
          return reply
            .code(400)
            .send({ error: { code: "BAD_REQUEST", message: "Custom category not found." } });
        category = custom.name;
      }
      const prompt = await resolvePrompt(
        context,
        request.userId,
        workflowKeySchema.enum["ideation.entity"],
      );
      const model = input.modelOverride ?? settings.baseModel;
      const alternatives: Array<{ name: string; description: string }> = [];
      for (let index = 0; index < input.count; index += 1) {
        const result = await (await context.getAi(request.userId, model)).complete({
          model,
          maxOutputTokens: 1_000,
          messages: ideationPromptMessages(
            "ideation.entity",
            prompt,
            {
              category,
              genres: labels("genres"),
              themes: labels("themes"),
              tags: labels("tags"),
              user_instructions: input.instructions,
            },
            selectedContext,
          ),
        });
        const [namePart, ...descriptionParts] = result.text.split("|");
        alternatives.push({
          name: descriptionParts.length
            ? namePart?.trim() || `Untitled ${category}`
            : `Untitled ${category}`,
          description: descriptionParts.length
            ? descriptionParts.join("|").trim()
            : result.text.trim(),
        });
        await context.db.insert(usageEvents).values({
          userId: request.userId,
          projectId,
          model,
          role: "ideation",
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        });
      }
      return { alternatives, model, promptId: prompt.id };
    }
    const prompt = await resolvePrompt(
      context,
      request.userId,
      workflowKeySchema.enum["ideation.premise"],
    );
    const model = input.modelOverride ?? settings.baseModel;
    const alternatives: string[] = [];
    for (let index = 0; index < input.count; index += 1) {
      const result = await (await context.getAi(request.userId, model)).complete({
        model,
        maxOutputTokens: 1_000,
        messages: ideationPromptMessages(
          "ideation.premise",
          prompt,
          {
            genres: labels("genres"),
            themes: labels("themes"),
            tags: labels("tags"),
            user_instructions: input.instructions,
          },
          selectedContext,
        ),
      });
      alternatives.push(result.text);
      await context.db.insert(usageEvents).values({
        userId: request.userId,
        projectId,
        model,
        role: "ideation",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    }
    return { alternatives, model, promptId: prompt.id };
  });
}
