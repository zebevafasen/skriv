import { basePackage } from "@asterism/content";
import {
  createTagPackCategoryInputSchema,
  createTagPackCollectionInputSchema,
  createTagPackInputSchema,
  projectDefaultsSchema,
  projectTagPackSchema,
  syncProjectTagPacksInputSchema,
  tagPackCatalogSchema,
  tagPackCategorySchema,
  tagPackCollectionSchema,
  tagPackSchema,
  updateTagPackCategoryInputSchema,
  updateTagPackCollectionInputSchema,
  updateTagPackInputSchema,
} from "@asterism/contracts";
import {
  compendiumEntries,
  projectDefaults,
  projectTagPacks,
  tagPackCatalogNodes,
  tagPacks,
  touchUpdatedAt,
} from "@asterism/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const packParams = z.object({ id: z.string().min(1) });
const projectPackParams = z.object({ projectId: z.uuid(), packId: z.string().min(1) });
const nodeParams = z.object({ id: z.string().min(1) });

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function customPackResponse(row: typeof tagPacks.$inferSelect, fallbackCollectionId: string) {
  return tagPackSchema.parse({
    ...row,
    collectionId: row.collectionId ?? fallbackCollectionId,
    ownership: "user",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function userNodeResponse(row: typeof tagPackCatalogNodes.$inferSelect) {
  const common = {
    ...row,
    ownership: "user" as const,
    protected: Boolean(row.systemKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return row.kind === "category"
    ? tagPackCategorySchema.parse(common)
    : tagPackCollectionSchema.parse({ ...common, categoryId: row.parentId });
}

async function ensureDefaultHierarchy(context: AppContext, userId: string) {
  let rows = await context.db
    .select()
    .from(tagPackCatalogNodes)
    .where(eq(tagPackCatalogNodes.userId, userId));
  let category = rows.find((row) => row.systemKey === "my-packs");
  if (!category) {
    await context.db
      .insert(tagPackCatalogNodes)
      .values({
        userId,
        kind: "category",
        parentId: null,
        name: "My Packs",
        normalizedName: "my packs",
        description: "Your custom tag-pack catalog.",
        systemKey: "my-packs",
      })
      .onConflictDoNothing();
    rows = await context.db
      .select()
      .from(tagPackCatalogNodes)
      .where(eq(tagPackCatalogNodes.userId, userId));
    category = rows.find((row) => row.systemKey === "my-packs");
  }
  if (!category) throw new Error("Default tag-pack category creation failed.");
  let collection = rows.find((row) => row.systemKey === "unsorted-packs");
  if (!collection) {
    await context.db
      .insert(tagPackCatalogNodes)
      .values({
        userId,
        kind: "collection",
        parentId: category.id,
        name: "Unsorted",
        normalizedName: "unsorted",
        description: "Custom packs that have not been organized yet.",
        systemKey: "unsorted-packs",
      })
      .onConflictDoNothing();
    rows = await context.db
      .select()
      .from(tagPackCatalogNodes)
      .where(eq(tagPackCatalogNodes.userId, userId));
    collection = rows.find((row) => row.systemKey === "unsorted-packs");
  }
  if (!collection) throw new Error("Default tag-pack collection creation failed.");
  await context.db
    .update(tagPacks)
    .set({ collectionId: collection.id })
    .where(and(eq(tagPacks.userId, userId), isNull(tagPacks.collectionId)));
  return { category, collection, rows };
}

export async function getTagPackCatalog(context: AppContext, userId: string) {
  const defaults = await ensureDefaultHierarchy(context, userId);
  const [nodes, rows] = await Promise.all([
    context.db.select().from(tagPackCatalogNodes).where(eq(tagPackCatalogNodes.userId, userId)),
    context.db.select().from(tagPacks).where(eq(tagPacks.userId, userId)),
  ]);
  return tagPackCatalogSchema.parse({
    categories: [
      ...basePackage.tagPackCategories.map((category) => ({
        ...category,
        ownership: "builtin",
        protected: true,
        createdAt: null,
        updatedAt: null,
      })),
      ...nodes.filter((node) => node.kind === "category").map(userNodeResponse),
    ],
    collections: [
      ...basePackage.tagPackCollections.map((collection) => ({
        ...collection,
        ownership: "builtin",
        protected: true,
        createdAt: null,
        updatedAt: null,
      })),
      ...nodes.filter((node) => node.kind === "collection").map(userNodeResponse),
    ],
    packs: [
      ...basePackage.tagPacks.map((pack) => ({
        ...pack,
        ownership: "builtin",
        createdAt: null,
        updatedAt: null,
      })),
      ...rows.map((row) => customPackResponse(row, defaults.collection.id)),
    ],
  });
}

export async function getTagPacks(context: AppContext, userId: string) {
  return (await getTagPackCatalog(context, userId)).packs;
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

export async function syncProjectTagPacks(
  context: AppContext,
  userId: string,
  projectId: string,
  requestedPackIds: string[],
) {
  const desiredIds = [...new Set(requestedPackIds)];
  const available = await getTagPacks(context, userId);
  const availableById = new Map(available.map((pack) => [pack.id, pack]));
  return context.db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(projectTagPacks)
      .where(eq(projectTagPacks.projectId, projectId));
    const currentById = new Map(current.map((pack) => [pack.sourcePackId, pack]));
    const additions = desiredIds.filter((id) => !currentById.has(id));
    const missing = additions.find((id) => !availableById.has(id));
    if (missing) throw Object.assign(new Error(`Tag pack not found: ${missing}.`), { statusCode: 400 });
    const removed = current.filter((pack) => !desiredIds.includes(pack.sourcePackId));

    if (removed.length) {
      await tx
        .delete(projectTagPacks)
        .where(
          and(
            eq(projectTagPacks.projectId, projectId),
            inArray(
              projectTagPacks.sourcePackId,
              removed.map((pack) => pack.sourcePackId),
            ),
          ),
        );
    }
    if (additions.length) {
      const packs = additions.flatMap((id) => {
        const pack = availableById.get(id);
        return pack ? [pack] : [];
      });
      await tx.insert(projectTagPacks).values(
        packs.map((pack) => ({
          projectId,
          sourcePackId: pack.id,
          name: pack.name,
          description: pack.description,
          ownership: pack.ownership,
          values: pack.values,
        })),
      );
    }

    if (removed.length) {
      const remaining = await tx
        .select()
        .from(projectTagPacks)
        .where(eq(projectTagPacks.projectId, projectId));
      const entries = await tx
        .select()
        .from(compendiumEntries)
        .where(eq(compendiumEntries.projectId, projectId));
      for (const kind of ["genres", "themes", "tags"] as const) {
        const removedIds = new Set(removed.flatMap((pack) => pack.values[kind]));
        const remainingIds = new Set(remaining.flatMap((pack) => pack.values[kind]));
        if (![...removedIds].some((id) => !remainingIds.has(id))) continue;
        const entry = entries.find((candidate) => candidate.singletonKey === kind);
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
    }

    return tx
      .select()
      .from(projectTagPacks)
      .where(eq(projectTagPacks.projectId, projectId));
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

  app.get("/api/tag-pack-catalog", async (request) =>
    getTagPackCatalog(context, request.userId),
  );
  app.get("/api/tag-packs", async (request) => getTagPacks(context, request.userId));

  app.post("/api/tag-pack-categories", async (request, reply) => {
    const input = parseWith(createTagPackCategoryInputSchema, request.body);
    const catalog = await getTagPackCatalog(context, request.userId);
    if (catalog.categories.some((category) => normalize(category.name) === normalize(input.name))) {
      return reply.code(409).send({
        error: { code: "DUPLICATE_NAME", message: "A tag-pack category with that name already exists." },
      });
    }
    const [created] = await context.db
      .insert(tagPackCatalogNodes)
      .values({
        userId: request.userId,
        kind: "category",
        parentId: null,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
      })
      .returning();
    if (!created) throw new Error("Tag-pack category creation failed.");
    return reply.code(201).send(userNodeResponse(created));
  });

  app.patch("/api/tag-pack-categories/:id", async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in categories cannot be changed." },
      });
    const input = parseWith(updateTagPackCategoryInputSchema, request.body);
    const [updated] = await context.db
      .update(tagPackCatalogNodes)
      .set({
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalize(input.name) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...touchUpdatedAt,
      })
      .where(
        and(
          eq(tagPackCatalogNodes.id, id),
          eq(tagPackCatalogNodes.userId, request.userId),
          eq(tagPackCatalogNodes.kind, "category"),
        ),
      )
      .returning();
    if (!updated) return notFound(reply, "Custom tag-pack category not found.");
    return userNodeResponse(updated);
  });

  app.delete("/api/tag-pack-categories/:id", async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in categories cannot be deleted." },
      });
    const defaults = await ensureDefaultHierarchy(context, request.userId);
    const nodes = await context.db
      .select()
      .from(tagPackCatalogNodes)
      .where(eq(tagPackCatalogNodes.userId, request.userId));
    const target = nodes.find((node) => node.id === id && node.kind === "category");
    if (!target) return notFound(reply, "Custom tag-pack category not found.");
    if (target.systemKey)
      return reply.code(409).send({
        error: { code: "PROTECTED_NODE", message: "The default My Packs category cannot be deleted." },
      });
    const childIds = nodes
      .filter((node) => node.kind === "collection" && node.parentId === id)
      .map((node) => node.id);
    await context.db.transaction(async (tx) => {
      if (childIds.length) {
        await tx
          .update(tagPacks)
          .set({ collectionId: defaults.collection.id, ...touchUpdatedAt })
          .where(
            and(eq(tagPacks.userId, request.userId), inArray(tagPacks.collectionId, childIds)),
          );
        await tx
          .delete(tagPackCatalogNodes)
          .where(
            and(
              eq(tagPackCatalogNodes.userId, request.userId),
              inArray(tagPackCatalogNodes.id, childIds),
            ),
          );
      }
      await tx
        .delete(tagPackCatalogNodes)
        .where(
          and(
            eq(tagPackCatalogNodes.id, id),
            eq(tagPackCatalogNodes.userId, request.userId),
          ),
        );
    });
    return reply.code(204).send();
  });

  app.post("/api/tag-pack-collections", async (request, reply) => {
    const input = parseWith(createTagPackCollectionInputSchema, request.body);
    const catalog = await getTagPackCatalog(context, request.userId);
    if (!catalog.categories.some((category) => category.id === input.categoryId)) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Parent tag-pack category was not found." },
      });
    }
    if (
      catalog.collections.some(
        (collection) =>
          collection.categoryId === input.categoryId &&
          normalize(collection.name) === normalize(input.name),
      )
    ) {
      return reply.code(409).send({
        error: { code: "DUPLICATE_NAME", message: "That category already has a collection with this name." },
      });
    }
    const [created] = await context.db
      .insert(tagPackCatalogNodes)
      .values({
        userId: request.userId,
        kind: "collection",
        parentId: input.categoryId,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
      })
      .returning();
    if (!created) throw new Error("Tag-pack collection creation failed.");
    return reply.code(201).send(userNodeResponse(created));
  });

  app.patch("/api/tag-pack-collections/:id", async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in collections cannot be changed." },
      });
    const input = parseWith(updateTagPackCollectionInputSchema, request.body);
    if (input.categoryId !== undefined) {
      const catalog = await getTagPackCatalog(context, request.userId);
      if (!catalog.categories.some((category) => category.id === input.categoryId)) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "Parent tag-pack category was not found." },
        });
      }
    }
    const [updated] = await context.db
      .update(tagPackCatalogNodes)
      .set({
        ...(input.categoryId !== undefined ? { parentId: input.categoryId } : {}),
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalize(input.name) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...touchUpdatedAt,
      })
      .where(
        and(
          eq(tagPackCatalogNodes.id, id),
          eq(tagPackCatalogNodes.userId, request.userId),
          eq(tagPackCatalogNodes.kind, "collection"),
        ),
      )
      .returning();
    if (!updated) return notFound(reply, "Custom tag-pack collection not found.");
    return userNodeResponse(updated);
  });

  app.delete("/api/tag-pack-collections/:id", async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in collections cannot be deleted." },
      });
    const defaults = await ensureDefaultHierarchy(context, request.userId);
    const [target] = await context.db
      .select()
      .from(tagPackCatalogNodes)
      .where(
        and(
          eq(tagPackCatalogNodes.id, id),
          eq(tagPackCatalogNodes.userId, request.userId),
          eq(tagPackCatalogNodes.kind, "collection"),
        ),
      );
    if (!target) return notFound(reply, "Custom tag-pack collection not found.");
    if (target.systemKey)
      return reply.code(409).send({
        error: { code: "PROTECTED_NODE", message: "The default Unsorted collection cannot be deleted." },
      });
    await context.db.transaction(async (tx) => {
      await tx
        .update(tagPacks)
        .set({ collectionId: defaults.collection.id, ...touchUpdatedAt })
        .where(and(eq(tagPacks.userId, request.userId), eq(tagPacks.collectionId, id)));
      await tx
        .delete(tagPackCatalogNodes)
        .where(
          and(
            eq(tagPackCatalogNodes.id, id),
            eq(tagPackCatalogNodes.userId, request.userId),
          ),
        );
    });
    return reply.code(204).send();
  });

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
    const catalog = await getTagPackCatalog(context, request.userId);
    if (!catalog.collections.some((collection) => collection.id === input.collectionId)) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Parent tag-pack collection was not found." },
      });
    }
    if (
      catalog.packs.some(
        (pack) =>
          pack.collectionId === input.collectionId && normalize(pack.name) === normalize(input.name),
      )
    ) {
      return reply.code(409).send({
        error: { code: "DUPLICATE_NAME", message: "That collection already has a pack with this name." },
      });
    }
    const [created] = await context.db
      .insert(tagPacks)
      .values({
        userId: request.userId,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
        collectionId: input.collectionId,
        values: input.values,
      })
      .returning();
    if (!created) throw new Error("Tag pack creation failed.");
    return reply.code(201).send(customPackResponse(created, input.collectionId));
  });

  app.patch("/api/tag-packs/:id", async (request, reply) => {
    const { id } = parseWith(packParams, request.params);
    if (!z.uuid().safeParse(id).success) return notFound(reply, "Custom tag pack not found.");
    const input = parseWith(updateTagPackInputSchema, request.body);
    if (input.collectionId !== undefined) {
      const catalog = await getTagPackCatalog(context, request.userId);
      if (!catalog.collections.some((collection) => collection.id === input.collectionId)) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "Parent tag-pack collection was not found." },
        });
      }
    }
    const [updated] = await context.db
      .update(tagPacks)
      .set({
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalize(input.name) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.collectionId !== undefined ? { collectionId: input.collectionId } : {}),
        ...(input.values !== undefined ? { values: input.values } : {}),
        ...touchUpdatedAt,
      })
      .where(and(eq(tagPacks.id, id), eq(tagPacks.userId, request.userId)))
      .returning();
    if (!updated) return notFound(reply, "Custom tag pack not found.");
    const defaults = await ensureDefaultHierarchy(context, request.userId);
    return customPackResponse(updated, defaults.collection.id);
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

  app.put("/api/projects/:projectId/tag-packs", async (request, reply) => {
    const { projectId } = parseWith(z.object({ projectId: z.uuid() }), request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(syncProjectTagPacksInputSchema, request.body);
    const rows = await syncProjectTagPacks(
      context,
      request.userId,
      projectId,
      input.packIds,
    );
    return rows.map(projectPackResponse);
  });

  app.post("/api/projects/:projectId/tag-packs/:packId/import", async (request, reply) => {
    const { projectId, packId } = parseWith(projectPackParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const current = await context.db
      .select()
      .from(projectTagPacks)
      .where(eq(projectTagPacks.projectId, projectId));
    const rows = await syncProjectTagPacks(context, request.userId, projectId, [
      ...current.map((pack) => pack.sourcePackId),
      packId,
    ]);
    const row = rows.find((pack) => pack.sourcePackId === packId);
    if (!row) throw new Error("Tag pack import failed.");
    return reply.code(201).send(projectPackResponse(row));
  });

  app.delete("/api/projects/:projectId/tag-packs/:packId", async (request, reply) => {
    const { projectId, packId } = parseWith(projectPackParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const current = await context.db
      .select()
      .from(projectTagPacks)
      .where(eq(projectTagPacks.projectId, projectId));
    if (!current.some((pack) => pack.sourcePackId === packId))
      return notFound(reply, "Imported tag pack not found.");
    await syncProjectTagPacks(
      context,
      request.userId,
      projectId,
      current.filter((pack) => pack.sourcePackId !== packId).map((pack) => pack.sourcePackId),
    );
    return reply.code(204).send();
  });
}
