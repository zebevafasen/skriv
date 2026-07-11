import {
  compendiumEntrySchema,
  createCompendiumEntryInputSchema,
  updateCompendiumEntryInputSchema,
} from "@asterism/contracts";
import { compendiumEntries, projects, touchUpdatedAt, workspaceMembers } from "@asterism/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const projectParams = z.object({ projectId: z.uuid() });
const entryParams = z.object({ id: z.uuid() });

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
}
