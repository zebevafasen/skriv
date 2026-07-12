import { basePackage } from "@asterism/content";
import {
  createTagPackInputSchema,
  projectDefaultsSchema,
  tagPackSchema,
  updateTagPackInputSchema,
} from "@asterism/contracts";
import {
  compendiumEntries,
  projectDefaults,
  tagPacks,
  touchUpdatedAt,
  userDefinitions,
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
  if (!packIds.length) return;
  const available = await getTagPacks(context, userId);
  const selected = packIds.map((id) => available.find((pack) => pack.id === id));
  if (selected.some((pack) => !pack))
    throw Object.assign(new Error("Tag pack not found."), { statusCode: 400 });
  const byId = new Map<string, { id: string; label: string }>(
    [...basePackage.genres, ...basePackage.themes, ...basePackage.tags].map((item) => [
      item.id,
      { id: item.id, label: item.label },
    ]),
  );
  const requestedIds = [
    ...new Set(
      selected.flatMap((pack) =>
        pack ? [...pack.values.genres, ...pack.values.themes, ...pack.values.tags] : [],
      ),
    ),
  ];
  const customIds = requestedIds.filter((id) => z.uuid().safeParse(id).success);
  const customRows = customIds.length
    ? await context.db
        .select()
        .from(userDefinitions)
        .where(and(eq(userDefinitions.userId, userId), inArray(userDefinitions.id, customIds)))
    : [];
  customRows.forEach((item) => {
    byId.set(item.id, { id: item.id, label: item.label });
  });

  const singletonRows = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  for (const kind of ["genres", "themes", "tags"] as const) {
    const entry = singletonRows.find((row) => row.singletonKey === kind);
    if (entry?.content.kind !== "selection") continue;
    const additions = selected
      .flatMap((pack) => pack?.values[kind] ?? [])
      .map((id) => {
        const definition = byId.get(id);
        if (!definition)
          throw Object.assign(new Error(`Tag-pack definition ${id} is unavailable.`), {
            statusCode: 400,
          });
        return { definitionId: id, label: definition.label, locked: false };
      });
    const merged = [...entry.content.values];
    for (const value of additions) {
      if (!merged.some((current) => normalize(current.label) === normalize(value.label)))
        merged.push(value);
    }
    await context.db
      .update(compendiumEntries)
      .set({ content: { kind: "selection", values: merged }, ...touchUpdatedAt })
      .where(eq(compendiumEntries.id, entry.id));
  }
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
    await importTagPacksIntoProject(context, request.userId, projectId, [packId]);
    return reply.code(204).send();
  });
}
