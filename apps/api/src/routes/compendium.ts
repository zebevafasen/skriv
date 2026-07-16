import {
  compendiumEntrySchema,
  createCompendiumEntryInputSchema,
  updateCompendiumEntryInputSchema,
  extractCompendiumFromTextInputSchema,
  extractCompendiumFromTextResponseSchema,
  importExtractedCompendiumFromTextInputSchema,
  importExtractedCompendiumResponseSchema,
  workflowKeySchema,
} from "@skriv/contracts";
import {
  compendiumCategories,
  compendiumEntries,
  projects,
  touchUpdatedAt,
  workspaceMembers,
  usageEvents,
} from "@skriv/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getSettings } from "./settings.js";
import { renderPrompt, protectedProtocolMessage, normalizeCompendiumContent } from "@skriv/core";
import {
  appendCompendiumContent,
  existingEntryNames,
  normalizedEntryName,
  parseCompendiumExtraction,
  richTextContent,
} from "./ideation.js";

const projectParams = z.object({ projectId: z.uuid() });
const entryParams = z.object({ id: z.uuid() });

function formatExistingEntries(entries: (typeof compendiumEntries.$inferSelect)[]): string {
  const regular = entries.filter((entry) => !entry.singletonKey);
  if (regular.length === 0) return "No existing entries.";
  return regular
    .map((entry) => {
      const type = entry.typeId.replace("story.", "");
      const name = entry.name;
      const aliases = entry.aliases && entry.aliases.length ? ` (aliases: ${entry.aliases.join(", ")})` : "";
      const descText = normalizeCompendiumContent(entry.content);
      return `- ${name}${aliases} [${type}]: ${descText}`;
    })
    .join("\n");
}

function entryResponse(entry: typeof compendiumEntries.$inferSelect) {
  return compendiumEntrySchema.parse({
    ...entry,
    singleton: entry.singletonKey !== null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
}

async function ownedEntry(context: AppContext, userId: string, entryId: string) {
  const [row] = await context.db
    .select({ entry: compendiumEntries })
    .from(compendiumEntries)
    .innerJoin(projects, eq(projects.id, compendiumEntries.projectId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
    .where(and(eq(compendiumEntries.id, entryId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row?.entry ?? null;
}

async function validType(context: AppContext, projectId: string, typeId: string) {
  if (!typeId.startsWith("custom.")) return true;
  const categoryId = typeId.slice("custom.".length);
  const [row] = await context.db
    .select({ id: compendiumCategories.id })
    .from(compendiumCategories)
    .where(
      and(eq(compendiumCategories.id, categoryId), eq(compendiumCategories.projectId, projectId)),
    )
    .limit(1);
  return Boolean(row);
}

export async function registerCompendiumRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/projects/:projectId/compendium", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const rows = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId))
      .orderBy(asc(compendiumEntries.name));
    return rows.map(entryResponse);
  });

  app.post("/api/projects/:projectId/compendium", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(createCompendiumEntryInputSchema, request.body);
    if (input.typeId.startsWith("project.")) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Project metadata types are managed singleton entries.",
        },
      });
    }
    if (!(await validType(context, projectId, input.typeId))) {
      return reply
        .code(400)
        .send({ error: { code: "BAD_REQUEST", message: "Custom category not found." } });
    }
    const [created] = await context.db
      .insert(compendiumEntries)
      .values({
        projectId,
        name: input.name,
        typeId: input.typeId,
        aliases: input.aliases ?? [],
        labels: input.labels ?? [],
        imageDataUrl: input.imageDataUrl ?? null,
        trackingEnabled: input.trackingEnabled ?? true,
        matchExclusions: input.matchExclusions ?? [],
        activationMode: input.activationMode ?? "mention",
        caseSensitive: input.caseSensitive ?? false,
        content: input.content,
      })
      .returning();
    if (!created) throw new Error("Compendium entry creation failed.");
    return reply.code(201).send(entryResponse(created));
  });

  app.get("/api/compendium/:id", async (request, reply) => {
    const { id } = parseWith(entryParams, request.params);
    const entry = await ownedEntry(context, request.userId, id);
    if (!entry) return notFound(reply, "Compendium entry not found.");
    return entryResponse(entry);
  });

  app.patch("/api/compendium/:id", async (request, reply) => {
    const { id } = parseWith(entryParams, request.params);
    const input = parseWith(updateCompendiumEntryInputSchema, request.body);
    const entry = await ownedEntry(context, request.userId, id);
    if (!entry) return notFound(reply, "Compendium entry not found.");
    if (entry.revision !== input.expectedRevision) {
      return conflict(reply, "Compendium entry changed since it was loaded.", {
        currentRevision: entry.revision,
      });
    }
    if (entry.singletonKey && input.typeId && input.typeId !== entry.typeId) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Singleton metadata types cannot be changed." },
      });
    }
    if (input.typeId && !(await validType(context, entry.projectId, input.typeId))) {
      return reply
        .code(400)
        .send({ error: { code: "BAD_REQUEST", message: "Custom category not found." } });
    }
    const [updated] = await context.db
      .update(compendiumEntries)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.typeId !== undefined ? { typeId: input.typeId } : {}),
        ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
        ...(input.imageDataUrl !== undefined ? { imageDataUrl: input.imageDataUrl } : {}),
        ...(input.trackingEnabled !== undefined ? { trackingEnabled: input.trackingEnabled } : {}),
        ...(input.matchExclusions !== undefined ? { matchExclusions: input.matchExclusions } : {}),
        ...(input.activationMode !== undefined ? { activationMode: input.activationMode } : {}),
        ...(input.caseSensitive !== undefined ? { caseSensitive: input.caseSensitive } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        revision: entry.revision + 1,
        ...touchUpdatedAt,
      })
      .where(
        and(eq(compendiumEntries.id, id), eq(compendiumEntries.revision, input.expectedRevision)),
      )
      .returning();
    if (!updated) return conflict(reply, "Compendium entry changed while it was being saved.");
    return entryResponse(updated);
  });

  app.delete("/api/compendium/:id", async (request, reply) => {
    const { id } = parseWith(entryParams, request.params);
    const entry = await ownedEntry(context, request.userId, id);
    if (!entry) return notFound(reply, "Compendium entry not found.");
    if (entry.singletonKey) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Project metadata entries cannot be deleted." },
      });
    }
    await context.db.delete(compendiumEntries).where(eq(compendiumEntries.id, id));
    return reply.code(204).send();
  });

  app.post("/api/projects/:projectId/compendium/extract", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(extractCompendiumFromTextInputSchema, request.body ?? {});
    const [project] = await context.db
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return notFound(reply, "Project not found.");
    const existingRows = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));

    const settings = await getSettings(context, request.userId);
    const prompt = await resolvePrompt(
      context,
      request.userId,
      workflowKeySchema.enum["compendium.extract"],
    );
    const model = input.modelOverride ?? settings.baseModel;
    const result = await (await context.getAi(request.userId, model)).complete({
      model,
      maxOutputTokens: 4_000,
      messages: [
        protectedProtocolMessage("compendium.extract"),
        ...renderPrompt(prompt, {
          text: input.text,
          story_language: project.settings.language,
          existing_entries: formatExistingEntries(existingRows),
        }),
      ],
    });
    let extracted;
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
    return extractCompendiumFromTextResponseSchema.parse({
      suggestions,
      model,
      promptId: prompt.id,
    });
  });

  app.post("/api/projects/:projectId/compendium/import", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(importExtractedCompendiumFromTextInputSchema, request.body);
    const allEntries = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, projectId));
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
          results.push(entryResponse(updated));
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
        results.push(entryResponse(created));
      }
      return results;
    });
    return reply.code(201).send(importExtractedCompendiumResponseSchema.parse(imported));
  });
}
