import { basePackage } from "@asterism/content";
import {
  createTagPackInputSchema,
  projectDefaultsSchema,
  projectTagPackSchema,
  tagPackSchema,
  updateTagPackInputSchema,
} from "@asterism/contracts";
import {
  compendiumEntries,
  projectDefaults,
  projectTagPacks,
  tagPacks,
  touchUpdatedAt,
} from "@asterism/db";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const packParams = z.object({ id: z.string().min(1) });
const projectPackParams = z.object({ projectId: z.uuid(), packId: z.string().min(1) });

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function customPackResponse(row: typeof tagPacks.$inferSelect) {
  return tagPackSchema.parse({
    ...row,
    ownership: "user",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getTagPacks(context: AppContext, userId: string) {
  const rows = await context.db.select().from(tagPacks).where(eq(tagPacks.userId, userId));
  return [
    ...basePackage.tagPacks.map((pack) =>
      tagPackSchema.parse({
        ...pack,
        ownership: "builtin",
        createdAt: null,
        updatedAt: null,
      }),
    ),
    ...rows.map(customPackResponse),
  ];
}

export async function resolveTagPack(context: AppContext, userId: string, id: string) {
  const packs = await getTagPacks(context, userId);
  return packs.find((pack) => pack.id === id) ?? null;
}

export async function importTagPacksIntoProject(
  context: AppContext,
  userId: string,
  projectId: string,
  packIds: string[],
) {
  if (!packIds.length) return [];
  const available = await getTagPacks(context, userId);
  const selected = packIds.map((id) => available.find((pack) => pack.id === id));
  if (selected.some((pack) => !pack))
    throw Object.assign(new Error("Tag pack not found."), { statusCode: 400 });
  const validSelected = selected.filter((pack) => pack !== undefined);
  await context.db
    .insert(projectTagPacks)
    .values(
      validSelected.map((pack) => ({
        projectId,
        sourcePackId: pack.id,
        name: pack.name,
        description: pack.description,
        ownership: pack.ownership,
        values: pack.values,
      })),
    )
    .onConflictDoNothing();
  return context.db
    .select()
    .from(projectTagPacks)
    .where(
      and(eq(projectTagPacks.projectId, projectId), inArray(projectTagPacks.sourcePackId, packIds)),
    );
}

function projectPackResponse(row: typeof projectTagPacks.$inferSelect) {
  return projectTagPackSchema.parse({
    id: row.sourcePackId,
    sourcePackId: row.sourcePackId,
    name: row.name,
    description: row.description,
    ownership: row.ownership,
    values: row.values,
    createdAt: null,
    updatedAt: null,
    importedAt: row.importedAt.toISOString(),
  });
}

export function removePackOnlyValues<T extends { definitionId: string | null }>(
  values: T[],
  removedIds: ReadonlySet<string>,
  remainingIds: ReadonlySet<string>,
) {
  return values.filter(
    (value) =>
      !value.definitionId ||
      !removedIds.has(value.definitionId) ||
      remainingIds.has(value.definitionId),
  );
}

export async function registerSetupRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/api/project-defaults", async (request) => {
    const [row] = await context.db
      .select()
      .from(projectDefaults)
      .where(eq(projectDefaults.userId, request.userId))
      .limit(1);
    return projectDefaultsSchema.parse(row ?? {});
  });

  app.put("/api/project-defaults", async (request) => {
    const input = parseWith(projectDefaultsSchema.partial(), request.body);
    const [existing] = await context.db
      .select()
      .from(projectDefaults)
      .where(eq(projectDefaults.userId, request.userId))
      .limit(1);
    const merged = projectDefaultsSchema.parse({ ...existing, ...input });
    await context.db
      .insert(projectDefaults)
      .values({ userId: request.userId, ...merged })
      .onConflictDoUpdate({
        target: projectDefaults.userId,
        set: { ...merged, updatedAt: new Date() },
      });
    return merged;
  });

  app.get("/api/tag-packs", async (request) => getTagPacks(context, request.userId));

  app.get("/api/projects/:projectId/tag-packs", async (request, reply) => {
    const { projectId } = parseWith(z.object({ projectId: z.uuid() }), request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const rows = await context.db
      .select()
      .from(projectTagPacks)
      .where(eq(projectTagPacks.projectId, projectId));
    return rows.map(projectPackResponse);
  });

  app.post("/api/tag-packs", async (request, reply) => {
    const input = parseWith(createTagPackInputSchema, request.body);
    const [created] = await context.db
      .insert(tagPacks)
      .values({
        userId: request.userId,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
        values: input.values,
      })
      .returning();
    if (!created) throw new Error("Tag pack creation failed.");
    return reply.code(201).send(customPackResponse(created));
  });

  app.patch("/api/tag-packs/:id", async (request, reply) => {
    const { id } = parseWith(packParams, request.params);
    if (!z.uuid().safeParse(id).success) return notFound(reply, "Custom tag pack not found.");
    const input = parseWith(updateTagPackInputSchema, request.body);
    const [updated] = await context.db
      .update(tagPacks)
      .set({
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalize(input.name) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.values !== undefined ? { values: input.values } : {}),
        ...touchUpdatedAt,
      })
      .where(and(eq(tagPacks.id, id), eq(tagPacks.userId, request.userId)))
      .returning();
    if (!updated) return notFound(reply, "Custom tag pack not found.");
    return customPackResponse(updated);
  });

  app.delete("/api/tag-packs/:id", async (request, reply) => {
    const { id } = parseWith(packParams, request.params);
    if (!z.uuid().safeParse(id).success) return notFound(reply, "Custom tag pack not found.");
    const [deleted] = await context.db
      .delete(tagPacks)
      .where(and(eq(tagPacks.id, id), eq(tagPacks.userId, request.userId)))
      .returning({ id: tagPacks.id });
    if (!deleted) return notFound(reply, "Custom tag pack not found.");
    return reply.code(204).send();
  });

  app.post("/api/projects/:projectId/tag-packs/:packId/import", async (request, reply) => {
    const { projectId, packId } = parseWith(projectPackParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const [row] = await importTagPacksIntoProject(context, request.userId, projectId, [packId]);
    if (!row) throw new Error("Tag pack import failed.");
    return reply.code(201).send(projectPackResponse(row));
  });

  app.delete("/api/projects/:projectId/tag-packs/:packId", async (request, reply) => {
    const { projectId, packId } = parseWith(projectPackParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const removed = await context.db.transaction(async (tx) => {
      const [snapshot] = await tx
        .delete(projectTagPacks)
        .where(
          and(eq(projectTagPacks.projectId, projectId), eq(projectTagPacks.sourcePackId, packId)),
        )
        .returning();
      if (!snapshot) return false;
      const remaining = await tx
        .select()
        .from(projectTagPacks)
        .where(eq(projectTagPacks.projectId, projectId));
      for (const kind of ["genres", "themes", "tags"] as const) {
        const removedIds = new Set(snapshot.values[kind]);
        const remainingIds = new Set(remaining.flatMap((pack) => pack.values[kind]));
        if (![...removedIds].some((id) => !remainingIds.has(id))) continue;
        const rows = await tx
          .select()
          .from(compendiumEntries)
          .where(eq(compendiumEntries.projectId, projectId));
        const entry = rows.find((row) => row.singletonKey === kind);
        if (entry?.content.kind !== "selection") continue;
        await tx
          .update(compendiumEntries)
          .set({
            content: {
              kind: "selection",
              values: removePackOnlyValues(entry.content.values, removedIds, remainingIds),
            },
            revision: entry.revision + 1,
            ...touchUpdatedAt,
          })
          .where(eq(compendiumEntries.id, entry.id));
      }
      return true;
    });
    if (!removed) return notFound(reply, "Imported tag pack not found.");
    return reply.code(204).send();
  });
}
