import { AppError } from "@skriv/application";
import { basePackage } from "@skriv/content";
import {
  compendiumTypeIdSchema,
  extractCompendiumInputSchema,
  extractedCompendiumDraftSchema,
  generateSceneSummaryInputSchema,
  importExtractedCompendiumInputSchema,
} from "@skriv/contracts";
import { protectedProtocolMessage, renderPrompt } from "@skriv/core";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { LocalDatabase } from "./database.js";
import { completeNativeAi } from "./native-ai.js";
import {
  aiSettings,
  compendiumCategories,
  compendiumEntries,
  packageSettings,
  projects,
  scenes,
  touchUpdatedAt,
  userCollections,
  userDefinitions,
} from "./schema.js";
import { resolvePrompt } from "./settings-prompts.js";

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
  typeId: compendiumTypeIdSchema.refine((value) => !value.startsWith("project.")),
  instructions: z.string().max(20_000).default(""),
  modelOverride: z.string().nullable().default(null),
  count: z.number().int().min(1).max(5).default(3),
});
const generateRequestSchema = z.union([entityRequestSchema, premiseRequestSchema]);
const definitionSchema = z.object({
  kind: z.enum(["genre", "theme", "tag"]),
  label: z.string().trim().min(1).max(120),
});
const collectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["genre", "theme", "tag"]),
  values: z.array(z.object({ definitionId: z.string().nullable(), label: z.string().min(1) })),
});
const extractionResultSchema = z.object({
  entries: z.array(extractedCompendiumDraftSchema).max(30),
});

function notFound(message: string): never {
  throw new AppError(message, "NOT_FOUND");
}

function conflict(message: string, details?: unknown): never {
  throw new AppError(message, "CONFLICT", details);
}

const entryResponse = (entry: typeof compendiumEntries.$inferSelect) => ({
  ...entry,
  singleton: entry.singletonKey !== null,
});

async function requireProject(db: LocalDatabase, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) notFound("Project not found.");
  return project;
}

async function metadataEntries(db: LocalDatabase, projectId: string) {
  const rows = await db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  return new Map(
    rows.filter((row) => row.singletonKey).map((row) => [row.singletonKey as string, row]),
  );
}

async function modelFor(db: LocalDatabase, override?: string | null) {
  if (override) return override;
  const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
  return settings?.baseModel || "openrouter/auto";
}

function richTextContent(text: string) {
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

function parseExtraction(value: string) {
  const clean = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const embedded = clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1);
  for (const candidate of [clean, fenced, embedded]) {
    if (!candidate) continue;
    try {
      return extractionResultSchema.parse(JSON.parse(candidate));
    } catch {
      // Try the next safe extraction form.
    }
  }
  throw new AppError("The model did not return valid Compendium JSON.", "PROVIDER_ERROR");
}

export async function handleIdeationRoutes(
  db: LocalDatabase,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown | null> {
  if (path === "/api/ideation/definitions" && method === "POST") {
    const input = definitionSchema.parse(body);
    const normalizedLabel = input.label.normalize("NFKC").toLocaleLowerCase();
    const [definition] = await db
      .insert(userDefinitions)
      .values({ id: crypto.randomUUID(), ...input, normalizedLabel })
      .onConflictDoUpdate({
        target: [userDefinitions.kind, userDefinitions.normalizedLabel],
        set: { label: input.label, ...touchUpdatedAt },
      })
      .returning();
    return definition;
  }
  if (path === "/api/ideation/base-package" && method === "PUT") {
    const input = z.object({ enabled: z.boolean() }).parse(body);
    await db
      .insert(packageSettings)
      .values({ packageId: basePackage.id, enabled: input.enabled })
      .onConflictDoUpdate({
        target: packageSettings.packageId,
        set: { enabled: input.enabled, ...touchUpdatedAt },
      });
    return undefined;
  }
  if (path === "/api/ideation/collections" && method === "POST") {
    const input = collectionSchema.parse(body);
    const [created] = await db
      .insert(userCollections)
      .values({ id: crypto.randomUUID(), ...input })
      .returning();
    return created;
  }

  const metadataMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/ideation$/i);
  if (metadataMatch) {
    const projectId = metadataMatch[1] as string;
    await requireProject(db, projectId);
    const entries = await metadataEntries(db, projectId);
    if (method === "GET") {
      return Object.fromEntries(
        ["premise", "genres", "themes", "tags"].map((key) => [
          key,
          entries.get(key)?.content ?? null,
        ]),
      );
    }
    if (method === "PATCH") {
      const input = metadataUpdateSchema.parse(body);
      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(input)) {
          const entry = entries.get(key);
          if (!entry || value === undefined) continue;
          const content =
            key === "premise"
              ? { kind: "text" as const, text: value as string }
              : {
                  kind: "selection" as const,
                  values: value as z.infer<typeof ingredientValueSchema>[],
                };
          if (JSON.stringify(content) === JSON.stringify(entry.content)) continue;
          await tx
            .update(compendiumEntries)
            .set({ content, revision: entry.revision + 1, ...touchUpdatedAt })
            .where(eq(compendiumEntries.id, entry.id));
        }
      });
      return undefined;
    }
  }

  const generateMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/ideation\/generate$/i);
  if (generateMatch && method === "POST") {
    const projectId = generateMatch[1] as string;
    await requireProject(db, projectId);
    const input = generateRequestSchema.parse(body);
    const entries = await metadataEntries(db, projectId);
    const labels = (key: "genres" | "themes" | "tags") => {
      const draft = input[key];
      const content = entries.get(key)?.content;
      const values = draft ?? (content?.kind === "selection" ? content.values : []);
      return values.map((value) => value.label).join(", ");
    };
    const references = await db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));
    const available = new Set(
      references.filter((item) => !item.singletonKey).map((item) => item.id),
    );
    if (
      new Set(input.contextEntryIds).size !== input.contextEntryIds.length ||
      input.contextEntryIds.some((id) => !available.has(id))
    ) {
      throw new AppError("One or more context entries were not found.", "BAD_REQUEST");
    }
    const selectedContext = references
      .filter((item) => input.contextEntryIds.includes(item.id))
      .map((item) => `${item.name}: ${JSON.stringify(item.content)}`)
      .join("\n");
    const workflow = input.mode === "entity" ? "ideation.entity" : "ideation.premise";
    const prompt = await resolvePrompt(db, workflow);
    const model = await modelFor(db, input.modelOverride);
    const alternatives: Array<string | { name: string; description: string }> = [];
    let category = "";
    if (input.mode === "entity") {
      category = input.typeId.replace("story.", "");
      if (input.typeId.startsWith("custom.")) {
        const [custom] = await db
          .select()
          .from(compendiumCategories)
          .where(eq(compendiumCategories.id, input.typeId.slice(7)))
          .limit(1);
        if (!custom || custom.projectId !== projectId)
          throw new AppError("Custom category not found.", "BAD_REQUEST");
        category = custom.name;
      }
    }
    for (let index = 0; index < input.count; index += 1) {
      const completion = await completeNativeAi({
        model,
        maxTokens: 1_000,
        messages: [
          protectedProtocolMessage(workflow),
          ...renderPrompt(prompt, {
            category,
            genres: labels("genres"),
            themes: labels("themes"),
            tags: labels("tags"),
            selected_context: selectedContext,
            user_instructions: input.instructions,
          }),
        ],
      });
      if (input.mode === "entity") {
        const [name, ...description] = completion.text.split("|");
        alternatives.push({
          name: description.length
            ? name?.trim() || `Untitled ${category}`
            : `Untitled ${category}`,
          description: description.length ? description.join("|").trim() : completion.text.trim(),
        });
      } else alternatives.push(completion.text.trim());
    }
    return { alternatives };
  }

  const extractMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/ideation\/extract-compendium$/i);
  if (extractMatch && method === "POST") {
    const projectId = extractMatch[1] as string;
    const project = await requireProject(db, projectId);
    const input = extractCompendiumInputSchema.parse(body);
    const entries = await metadataEntries(db, projectId);
    const premise = entries.get("premise");
    if (premise?.content.kind !== "text" || !premise.content.text.trim()) {
      throw new AppError("Save a premise before extracting Compendium entries.", "BAD_REQUEST");
    }
    const prompt = await resolvePrompt(db, "ideation.compendium_extract");
    const model = await modelFor(db, input.modelOverride);
    const completion = await completeNativeAi({
      model,
      maxTokens: 4_000,
      messages: [
        protectedProtocolMessage("ideation.compendium_extract"),
        ...renderPrompt(prompt, {
          premise: premise.content.text,
          story_language: project.settings.language,
        }),
      ],
    });
    const existing = await db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));
    const byName = new Map<string, (typeof existing)[number]>();
    for (const entry of existing.filter((item) => !item.singletonKey)) {
      for (const name of [entry.name, ...entry.aliases])
        byName.set(name.trim().toLocaleLowerCase(), entry);
    }
    return {
      sourcePremiseRevision: premise.revision,
      suggestions: parseExtraction(completion.text).entries.map((entry) => {
        const duplicate = byName.get(entry.name.trim().toLocaleLowerCase());
        return {
          ...entry,
          id: crypto.randomUUID(),
          duplicateEntryId: duplicate?.id ?? null,
          duplicateEntryRevision: duplicate?.revision ?? null,
        };
      }),
      model,
      promptId: prompt.id,
    };
  }

  const importMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/ideation\/import-compendium$/i);
  if (importMatch && method === "POST") {
    const projectId = importMatch[1] as string;
    await requireProject(db, projectId);
    const input = importExtractedCompendiumInputSchema.parse(body);
    const metadata = await metadataEntries(db, projectId);
    if (metadata.get("premise")?.revision !== input.sourcePremiseRevision) {
      conflict("The premise changed after extraction. Run extraction again.");
    }
    return db.transaction(async (tx) => {
      const result = [];
      for (const entry of input.entries) {
        if (entry.existingEntryId) {
          const [existing] = await tx
            .select()
            .from(compendiumEntries)
            .where(eq(compendiumEntries.id, entry.existingEntryId))
            .limit(1);
          if (
            !existing ||
            existing.projectId !== projectId ||
            existing.revision !== entry.expectedExistingRevision
          ) {
            conflict("A matching Compendium entry changed. Run extraction again.");
          }
          const [updated] = await tx
            .update(compendiumEntries)
            .set({
              name: entry.name,
              typeId: entry.typeId,
              content: richTextContent(entry.description),
              revision: existing.revision + 1,
              ...touchUpdatedAt,
            })
            .where(
              and(
                eq(compendiumEntries.id, existing.id),
                eq(compendiumEntries.revision, existing.revision),
              ),
            )
            .returning();
          if (!updated) conflict("Compendium entry changed during import.");
          result.push(entryResponse(updated));
        } else {
          const [created] = await tx
            .insert(compendiumEntries)
            .values({
              id: crypto.randomUUID(),
              projectId,
              name: entry.name,
              typeId: entry.typeId,
              aliases: [],
              labels: [],
              imageDataUrl: null,
              trackingEnabled: true,
              matchExclusions: [],
              activationMode: "mention",
              caseSensitive: false,
              content: richTextContent(entry.description),
            })
            .returning();
          if (!created) throw new AppError("Compendium import failed.", "DATABASE_ERROR");
          result.push(entryResponse(created));
        }
      }
      return result;
    });
  }

  const summaryMatch = path.match(/^\/api\/scenes\/([0-9a-f-]+)\/summary\/generate$/i);
  if (summaryMatch && method === "POST") {
    const sceneId = summaryMatch[1] as string;
    const input = generateSceneSummaryInputSchema.parse(body);
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
    if (!scene) notFound("Scene not found.");
    if (scene.version !== input.expectedVersion)
      conflict("Scene changed before summary generation began.", { currentVersion: scene.version });
    if (!scene.plainText.trim())
      throw new AppError("Write Scene prose before summarizing.", "VALIDATION_ERROR");
    const prompt = await resolvePrompt(db, "summary.scene");
    const completion = await completeNativeAi({
      model: await modelFor(db, input.modelOverride),
      maxTokens: 700,
      messages: [
        protectedProtocolMessage("summary.scene"),
        ...renderPrompt(prompt, { scene_title: scene.title, scene_prose: scene.plainText }),
      ],
    });
    const summary = completion.text.trim();
    if (!summary) throw new AppError("The model returned an empty summary.", "PROVIDER_ERROR");
    const [updated] = await db
      .update(scenes)
      .set({
        metadata: { ...scene.metadata, summary },
        version: scene.version + 1,
        ...touchUpdatedAt,
      })
      .where(and(eq(scenes.id, scene.id), eq(scenes.version, input.expectedVersion)))
      .returning();
    if (!updated) conflict("Scene changed while its summary was generated.");
    return updated;
  }

  return null;
}
