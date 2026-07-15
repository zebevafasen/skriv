import { basePackage } from "@skriv/content";
import {
  createIngredientPackCategoryInputSchema,
  createIngredientPackCollectionInputSchema,
  createIngredientPackInputSchema,
  projectDefaultsSchema,
  projectIngredientPackSchema,
  syncProjectIngredientPacksInputSchema,
  ingredientPackCatalogSchema,
  ingredientPackCategorySchema,
  ingredientPackCollectionSchema,
  ingredientPackSchema,
  updateIngredientPackCategoryInputSchema,
  updateIngredientPackCollectionInputSchema,
  updateIngredientPackInputSchema,
} from "@skriv/contracts";
import {
  compendiumEntries,
  projectDefaults,
  projectIngredientPacks,
  ingredientPackCatalogNodes,
  ingredientPacks,
  touchUpdatedAt,
} from "@skriv/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const ingredientPackParams = z.object({ id: z.string().min(1) });
const projectIngredientPackParams = z.object({ projectId: z.uuid(), packId: z.string().min(1) });
const nodeParams = z.object({ id: z.string().min(1) });

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function customIngredientPackResponse(
  row: typeof ingredientPacks.$inferSelect,
  fallbackCollectionId: string,
) {
  return ingredientPackSchema.parse({
    ...row,
    collectionId: row.collectionId ?? fallbackCollectionId,
    ownership: "user",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function userNodeResponse(row: typeof ingredientPackCatalogNodes.$inferSelect) {
  const common = {
    ...row,
    description:
      row.systemKey === "my-packs" ? "Your custom ingredient pack catalog." : row.description,
    ownership: "user" as const,
    protected: Boolean(row.systemKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return row.kind === "category"
    ? ingredientPackCategorySchema.parse(common)
    : ingredientPackCollectionSchema.parse({ ...common, categoryId: row.parentId });
}

async function ensureDefaultHierarchy(context: AppContext, userId: string) {
  let rows = await context.db
    .select()
    .from(ingredientPackCatalogNodes)
    .where(eq(ingredientPackCatalogNodes.userId, userId));
  let category = rows.find((row) => row.systemKey === "my-packs");
  if (!category) {
    await context.db
      .insert(ingredientPackCatalogNodes)
      .values({
        userId,
        kind: "category",
        parentId: null,
        name: "My Packs",
        normalizedName: "my packs",
        description: "Your custom ingredient pack catalog.",
        systemKey: "my-packs",
      })
      .onConflictDoNothing();
    rows = await context.db
      .select()
      .from(ingredientPackCatalogNodes)
      .where(eq(ingredientPackCatalogNodes.userId, userId));
    category = rows.find((row) => row.systemKey === "my-packs");
  }
  if (!category) throw new Error("Default ingredient pack category creation failed.");
  let collection = rows.find((row) => row.systemKey === "unsorted-packs");
  if (!collection) {
    await context.db
      .insert(ingredientPackCatalogNodes)
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
      .from(ingredientPackCatalogNodes)
      .where(eq(ingredientPackCatalogNodes.userId, userId));
    collection = rows.find((row) => row.systemKey === "unsorted-packs");
  }
  if (!collection) throw new Error("Default ingredient pack collection creation failed.");
  await context.db
    .update(ingredientPacks)
    .set({ collectionId: collection.id })
    .where(and(eq(ingredientPacks.userId, userId), isNull(ingredientPacks.collectionId)));
  return { category, collection, rows };
}

export async function getIngredientPackCatalog(context: AppContext, userId: string) {
  const defaults = await ensureDefaultHierarchy(context, userId);
  const [nodes, rows] = await Promise.all([
    context.db.select().from(ingredientPackCatalogNodes).where(eq(ingredientPackCatalogNodes.userId, userId)),
    context.db.select().from(ingredientPacks).where(eq(ingredientPacks.userId, userId)),
  ]);
  return ingredientPackCatalogSchema.parse({
    categories: [
      ...basePackage.ingredientPackCategories.map((category) => ({
        ...category,
        ownership: "builtin",
        protected: true,
        createdAt: null,
        updatedAt: null,
      })),
      ...nodes.filter((node) => node.kind === "category").map(userNodeResponse),
    ],
    collections: [
      ...basePackage.ingredientPackCollections.map((collection) => ({
        ...collection,
        ownership: "builtin",
        protected: true,
        createdAt: null,
        updatedAt: null,
      })),
      ...nodes.filter((node) => node.kind === "collection").map(userNodeResponse),
    ],
    packs: [
      ...basePackage.ingredientPacks.map((pack) => ({
        ...pack,
        ownership: "builtin",
        createdAt: null,
        updatedAt: null,
      })),
      ...rows.map((row) => customIngredientPackResponse(row, defaults.collection.id)),
    ],
  });
}

export async function getIngredientPacks(context: AppContext, userId: string) {
  return (await getIngredientPackCatalog(context, userId)).packs;
}

export async function resolveIngredientPack(context: AppContext, userId: string, id: string) {
  const packs = await getIngredientPacks(context, userId);
  return packs.find((pack) => pack.id === id) ?? null;
}

export async function importIngredientPacksIntoProject(
  context: AppContext,
  userId: string,
  projectId: string,
  packIds: string[],
) {
  if (!packIds.length) return [];
  const available = await getIngredientPacks(context, userId);
  const selected = packIds.map((id) => available.find((pack) => pack.id === id));
  if (selected.some((pack) => !pack))
    throw Object.assign(new Error("Ingredient pack not found."), { statusCode: 400 });
  const validSelected = selected.filter((pack) => pack !== undefined);
  await context.db
    .insert(projectIngredientPacks)
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
    .from(projectIngredientPacks)
    .where(
      and(eq(projectIngredientPacks.projectId, projectId), inArray(projectIngredientPacks.sourcePackId, packIds)),
    );
}

function projectIngredientPackResponse(row: typeof projectIngredientPacks.$inferSelect) {
  return projectIngredientPackSchema.parse({
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

export async function syncProjectIngredientPacks(
  context: AppContext,
  userId: string,
  projectId: string,
  requestedPackIds: string[],
) {
  const desiredIds = [...new Set(requestedPackIds)];
  const available = await getIngredientPacks(context, userId);
  const availableById = new Map(available.map((pack) => [pack.id, pack]));
  return context.db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(projectIngredientPacks)
      .where(eq(projectIngredientPacks.projectId, projectId));
    const currentById = new Map(current.map((pack) => [pack.sourcePackId, pack]));
    const additions = desiredIds.filter((id) => !currentById.has(id));
    const missing = additions.find((id) => !availableById.has(id));
    if (missing) throw Object.assign(new Error(`Ingredient pack not found: ${missing}.`), { statusCode: 400 });
    const removed = current.filter((pack) => !desiredIds.includes(pack.sourcePackId));

    if (removed.length) {
      await tx
        .delete(projectIngredientPacks)
        .where(
          and(
            eq(projectIngredientPacks.projectId, projectId),
            inArray(
              projectIngredientPacks.sourcePackId,
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
      await tx.insert(projectIngredientPacks).values(
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
        .from(projectIngredientPacks)
        .where(eq(projectIngredientPacks.projectId, projectId));
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
              values: removeIngredientPackOnlyValues(
                entry.content.values,
                removedIds,
                remainingIds,
              ),
            },
            revision: entry.revision + 1,
            ...touchUpdatedAt,
          })
          .where(eq(compendiumEntries.id, entry.id));
      }
    }

    return tx
      .select()
      .from(projectIngredientPacks)
      .where(eq(projectIngredientPacks.projectId, projectId));
  });
}

export function removeIngredientPackOnlyValues<T extends { definitionId: string | null }>(
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

  // Keep the former tag-pack routes as compatibility aliases for existing clients.
  for (const routePath of ["/api/ingredient-pack-catalog", "/api/tag-pack-catalog"])
    app.get(routePath, async (request) => getIngredientPackCatalog(context, request.userId));
  for (const routePath of ["/api/ingredient-packs", "/api/tag-packs"])
    app.get(routePath, async (request) => getIngredientPacks(context, request.userId));

  for (const routePath of ["/api/ingredient-pack-categories", "/api/tag-pack-categories"])
    app.post(routePath, async (request, reply) => {
    const input = parseWith(createIngredientPackCategoryInputSchema, request.body);
    const catalog = await getIngredientPackCatalog(context, request.userId);
    if (catalog.categories.some((category) => normalize(category.name) === normalize(input.name))) {
      return reply.code(409).send({
        error: {
          code: "DUPLICATE_NAME",
          message: "An ingredient pack category with that name already exists.",
        },
      });
    }
    const [created] = await context.db
      .insert(ingredientPackCatalogNodes)
      .values({
        userId: request.userId,
        kind: "category",
        parentId: null,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
      })
      .returning();
    if (!created) throw new Error("Ingredient pack category creation failed.");
    return reply.code(201).send(userNodeResponse(created));
  });

  for (const routePath of [
    "/api/ingredient-pack-categories/:id",
    "/api/tag-pack-categories/:id",
  ])
    app.patch(routePath, async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in categories cannot be changed." },
      });
    const input = parseWith(updateIngredientPackCategoryInputSchema, request.body);
    const [updated] = await context.db
      .update(ingredientPackCatalogNodes)
      .set({
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalize(input.name) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...touchUpdatedAt,
      })
      .where(
        and(
          eq(ingredientPackCatalogNodes.id, id),
          eq(ingredientPackCatalogNodes.userId, request.userId),
          eq(ingredientPackCatalogNodes.kind, "category"),
        ),
      )
      .returning();
    if (!updated) return notFound(reply, "Custom ingredient pack category not found.");
    return userNodeResponse(updated);
  });

  for (const routePath of [
    "/api/ingredient-pack-categories/:id",
    "/api/tag-pack-categories/:id",
  ])
    app.delete(routePath, async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in categories cannot be deleted." },
      });
    const defaults = await ensureDefaultHierarchy(context, request.userId);
    const nodes = await context.db
      .select()
      .from(ingredientPackCatalogNodes)
      .where(eq(ingredientPackCatalogNodes.userId, request.userId));
    const target = nodes.find((node) => node.id === id && node.kind === "category");
    if (!target) return notFound(reply, "Custom ingredient pack category not found.");
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
          .update(ingredientPacks)
          .set({ collectionId: defaults.collection.id, ...touchUpdatedAt })
          .where(
            and(eq(ingredientPacks.userId, request.userId), inArray(ingredientPacks.collectionId, childIds)),
          );
        await tx
          .delete(ingredientPackCatalogNodes)
          .where(
            and(
              eq(ingredientPackCatalogNodes.userId, request.userId),
              inArray(ingredientPackCatalogNodes.id, childIds),
            ),
          );
      }
      await tx
        .delete(ingredientPackCatalogNodes)
        .where(
          and(
            eq(ingredientPackCatalogNodes.id, id),
            eq(ingredientPackCatalogNodes.userId, request.userId),
          ),
        );
    });
    return reply.code(204).send();
  });

  for (const routePath of ["/api/ingredient-pack-collections", "/api/tag-pack-collections"])
    app.post(routePath, async (request, reply) => {
    const input = parseWith(createIngredientPackCollectionInputSchema, request.body);
    const catalog = await getIngredientPackCatalog(context, request.userId);
    if (!catalog.categories.some((category) => category.id === input.categoryId)) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Parent ingredient pack category was not found." },
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
      .insert(ingredientPackCatalogNodes)
      .values({
        userId: request.userId,
        kind: "collection",
        parentId: input.categoryId,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
      })
      .returning();
    if (!created) throw new Error("Ingredient pack collection creation failed.");
    return reply.code(201).send(userNodeResponse(created));
  });

  for (const routePath of [
    "/api/ingredient-pack-collections/:id",
    "/api/tag-pack-collections/:id",
  ])
    app.patch(routePath, async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in collections cannot be changed." },
      });
    const input = parseWith(updateIngredientPackCollectionInputSchema, request.body);
    if (input.categoryId !== undefined) {
      const catalog = await getIngredientPackCatalog(context, request.userId);
      if (!catalog.categories.some((category) => category.id === input.categoryId)) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "Parent ingredient pack category was not found." },
        });
      }
    }
    const [updated] = await context.db
      .update(ingredientPackCatalogNodes)
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
          eq(ingredientPackCatalogNodes.id, id),
          eq(ingredientPackCatalogNodes.userId, request.userId),
          eq(ingredientPackCatalogNodes.kind, "collection"),
        ),
      )
      .returning();
    if (!updated) return notFound(reply, "Custom ingredient pack collection not found.");
    return userNodeResponse(updated);
  });

  for (const routePath of [
    "/api/ingredient-pack-collections/:id",
    "/api/tag-pack-collections/:id",
  ])
    app.delete(routePath, async (request, reply) => {
    const { id } = parseWith(nodeParams, request.params);
    if (!z.uuid().safeParse(id).success)
      return reply.code(409).send({
        error: { code: "IMMUTABLE_BUILTIN", message: "Built-in collections cannot be deleted." },
      });
    const defaults = await ensureDefaultHierarchy(context, request.userId);
    const [target] = await context.db
      .select()
      .from(ingredientPackCatalogNodes)
      .where(
        and(
          eq(ingredientPackCatalogNodes.id, id),
          eq(ingredientPackCatalogNodes.userId, request.userId),
          eq(ingredientPackCatalogNodes.kind, "collection"),
        ),
      );
    if (!target) return notFound(reply, "Custom ingredient pack collection not found.");
    if (target.systemKey)
      return reply.code(409).send({
        error: { code: "PROTECTED_NODE", message: "The default Unsorted collection cannot be deleted." },
      });
    await context.db.transaction(async (tx) => {
      await tx
        .update(ingredientPacks)
        .set({ collectionId: defaults.collection.id, ...touchUpdatedAt })
        .where(and(eq(ingredientPacks.userId, request.userId), eq(ingredientPacks.collectionId, id)));
      await tx
        .delete(ingredientPackCatalogNodes)
        .where(
          and(
            eq(ingredientPackCatalogNodes.id, id),
            eq(ingredientPackCatalogNodes.userId, request.userId),
          ),
        );
    });
    return reply.code(204).send();
  });

  for (const routePath of [
    "/api/projects/:projectId/ingredient-packs",
    "/api/projects/:projectId/tag-packs",
  ])
    app.get(routePath, async (request, reply) => {
    const { projectId } = parseWith(z.object({ projectId: z.uuid() }), request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const rows = await context.db
      .select()
      .from(projectIngredientPacks)
      .where(eq(projectIngredientPacks.projectId, projectId));
    return rows.map(projectIngredientPackResponse);
  });

  for (const routePath of ["/api/ingredient-packs", "/api/tag-packs"])
    app.post(routePath, async (request, reply) => {
    const input = parseWith(createIngredientPackInputSchema, request.body);
    const catalog = await getIngredientPackCatalog(context, request.userId);
    if (!catalog.collections.some((collection) => collection.id === input.collectionId)) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Parent ingredient pack collection was not found." },
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
      .insert(ingredientPacks)
      .values({
        userId: request.userId,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
        collectionId: input.collectionId,
        values: input.values,
      })
      .returning();
    if (!created) throw new Error("Ingredient pack creation failed.");
    return reply.code(201).send(customIngredientPackResponse(created, input.collectionId));
  });

  for (const routePath of ["/api/ingredient-packs/:id", "/api/tag-packs/:id"])
    app.patch(routePath, async (request, reply) => {
    const { id } = parseWith(ingredientPackParams, request.params);
    if (!z.uuid().safeParse(id).success) return notFound(reply, "Custom ingredient pack not found.");
    const input = parseWith(updateIngredientPackInputSchema, request.body);
    if (input.collectionId !== undefined) {
      const catalog = await getIngredientPackCatalog(context, request.userId);
      if (!catalog.collections.some((collection) => collection.id === input.collectionId)) {
        return reply.code(400).send({
          error: { code: "BAD_REQUEST", message: "Parent ingredient pack collection was not found." },
        });
      }
    }
    const [updated] = await context.db
      .update(ingredientPacks)
      .set({
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalize(input.name) }
          : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.collectionId !== undefined ? { collectionId: input.collectionId } : {}),
        ...(input.values !== undefined ? { values: input.values } : {}),
        ...touchUpdatedAt,
      })
      .where(and(eq(ingredientPacks.id, id), eq(ingredientPacks.userId, request.userId)))
      .returning();
    if (!updated) return notFound(reply, "Custom ingredient pack not found.");
    const defaults = await ensureDefaultHierarchy(context, request.userId);
    return customIngredientPackResponse(updated, defaults.collection.id);
  });

  for (const routePath of ["/api/ingredient-packs/:id", "/api/tag-packs/:id"])
    app.delete(routePath, async (request, reply) => {
    const { id } = parseWith(ingredientPackParams, request.params);
    if (!z.uuid().safeParse(id).success) return notFound(reply, "Custom ingredient pack not found.");
    const [deleted] = await context.db
      .delete(ingredientPacks)
      .where(and(eq(ingredientPacks.id, id), eq(ingredientPacks.userId, request.userId)))
      .returning({ id: ingredientPacks.id });
    if (!deleted) return notFound(reply, "Custom ingredient pack not found.");
    return reply.code(204).send();
  });

  for (const routePath of [
    "/api/projects/:projectId/ingredient-packs",
    "/api/projects/:projectId/tag-packs",
  ])
    app.put(routePath, async (request, reply) => {
    const { projectId } = parseWith(z.object({ projectId: z.uuid() }), request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(syncProjectIngredientPacksInputSchema, request.body);
    const rows = await syncProjectIngredientPacks(
      context,
      request.userId,
      projectId,
      input.ingredientPackIds,
    );
    return rows.map(projectIngredientPackResponse);
  });

  for (const routePath of [
    "/api/projects/:projectId/ingredient-packs/:packId/import",
    "/api/projects/:projectId/tag-packs/:packId/import",
  ])
    app.post(routePath, async (request, reply) => {
    const { projectId, packId } = parseWith(projectIngredientPackParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const current = await context.db
      .select()
      .from(projectIngredientPacks)
      .where(eq(projectIngredientPacks.projectId, projectId));
    const rows = await syncProjectIngredientPacks(context, request.userId, projectId, [
      ...current.map((pack) => pack.sourcePackId),
      packId,
    ]);
    const row = rows.find((pack) => pack.sourcePackId === packId);
    if (!row) throw new Error("Ingredient pack import failed.");
    return reply.code(201).send(projectIngredientPackResponse(row));
  });

  for (const routePath of [
    "/api/projects/:projectId/ingredient-packs/:packId",
    "/api/projects/:projectId/tag-packs/:packId",
  ])
    app.delete(routePath, async (request, reply) => {
    const { projectId, packId } = parseWith(projectIngredientPackParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const current = await context.db
      .select()
      .from(projectIngredientPacks)
      .where(eq(projectIngredientPacks.projectId, projectId));
    if (!current.some((pack) => pack.sourcePackId === packId))
      return notFound(reply, "Imported ingredient pack not found.");
    await syncProjectIngredientPacks(
      context,
      request.userId,
      projectId,
      current.filter((pack) => pack.sourcePackId !== packId).map((pack) => pack.sourcePackId),
    );
    return reply.code(204).send();
  });
}
