import { AppError } from "@skriv/application";
import { basePackage } from "@skriv/content";
import {
  createIngredientPackCategoryInputSchema,
  createIngredientPackCollectionInputSchema,
  createIngredientPackInputSchema,
  syncProjectIngredientPacksInputSchema,
  updateIngredientPackCategoryInputSchema,
  updateIngredientPackCollectionInputSchema,
  updateIngredientPackInputSchema,
} from "@skriv/contracts";
import { and, eq, inArray } from "drizzle-orm";
import type { LocalDatabase } from "./database.js";
import {
  ingredientPackCatalogNodes,
  ingredientPacks,
  projectIngredientPacks,
  projects,
  touchUpdatedAt,
} from "./schema.js";

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();

function notFound(message: string): never {
  throw new AppError(message, "NOT_FOUND");
}

function conflict(message: string): never {
  throw new AppError(message, "CONFLICT");
}

async function ensureDefaultHierarchy(db: LocalDatabase) {
  let rows = await db.select().from(ingredientPackCatalogNodes);
  let category = rows.find((row) => row.systemKey === "my-packs");
  if (!category) {
    const [created] = await db
      .insert(ingredientPackCatalogNodes)
      .values({
        id: crypto.randomUUID(),
        kind: "category",
        parentId: null,
        name: "My Packs",
        normalizedName: "my packs",
        description: "Your custom ingredient pack catalog.",
        systemKey: "my-packs",
      })
      .returning();
    category = created;
    rows = await db.select().from(ingredientPackCatalogNodes);
  }
  if (!category) throw new AppError("Default catalog creation failed.", "DATABASE_ERROR");
  let collection = rows.find((row) => row.systemKey === "unsorted-packs");
  if (!collection) {
    const [created] = await db
      .insert(ingredientPackCatalogNodes)
      .values({
        id: crypto.randomUUID(),
        kind: "collection",
        parentId: category.id,
        name: "Unsorted",
        normalizedName: "unsorted",
        description: "Custom packs that have not been organized yet.",
        systemKey: "unsorted-packs",
      })
      .returning();
    collection = created;
    rows = await db.select().from(ingredientPackCatalogNodes);
  }
  if (!collection) throw new AppError("Default catalog collection failed.", "DATABASE_ERROR");
  return { category, collection, rows };
}

function nodeResponse(row: typeof ingredientPackCatalogNodes.$inferSelect) {
  const common = {
    id: row.id,
    name: row.name,
    description: row.description,
    ownership: "user" as const,
    protected: Boolean(row.systemKey),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return row.kind === "category" ? common : { ...common, categoryId: row.parentId };
}

function customPackResponse(
  row: typeof ingredientPacks.$inferSelect,
  fallbackCollectionId: string,
) {
  return {
    id: row.id,
    collectionId: row.collectionId ?? fallbackCollectionId,
    name: row.name,
    description: row.description,
    ownership: "user" as const,
    values: row.values,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function projectPackResponse(row: typeof projectIngredientPacks.$inferSelect) {
  return {
    id: row.sourcePackId,
    sourcePackId: row.sourcePackId,
    name: row.name,
    description: row.description,
    ownership: row.ownership,
    values: row.values,
    createdAt: null,
    updatedAt: null,
    importedAt: row.importedAt,
  };
}

async function catalog(db: LocalDatabase) {
  const defaults = await ensureDefaultHierarchy(db);
  const nodes = await db.select().from(ingredientPackCatalogNodes);
  const customPacks = await db.select().from(ingredientPacks);
  return {
    categories: [
      ...basePackage.ingredientPackCategories.map((item) => ({
        ...item,
        ownership: "builtin" as const,
        protected: true,
        createdAt: null,
        updatedAt: null,
      })),
      ...nodes.filter((item) => item.kind === "category").map(nodeResponse),
    ],
    collections: [
      ...basePackage.ingredientPackCollections.map((item) => ({
        ...item,
        ownership: "builtin" as const,
        protected: true,
        createdAt: null,
        updatedAt: null,
      })),
      ...nodes.filter((item) => item.kind === "collection").map(nodeResponse),
    ],
    packs: [
      ...basePackage.ingredientPacks.map((item) => ({
        ...item,
        ownership: "builtin" as const,
        createdAt: null,
        updatedAt: null,
      })),
      ...customPacks.map((item) => customPackResponse(item, defaults.collection.id)),
    ],
  };
}

async function requireProject(db: LocalDatabase, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) notFound("Project not found.");
}

async function syncProjectPacks(db: LocalDatabase, projectId: string, requestedIds: string[]) {
  await requireProject(db, projectId);
  const uniqueIds = [...new Set(requestedIds)];
  const available = (await catalog(db)).packs;
  const selected = uniqueIds.map((id) => available.find((pack) => pack.id === id));
  if (selected.some((pack) => !pack))
    throw new AppError("Ingredient pack not found.", "BAD_REQUEST");
  await db.transaction(async (tx) => {
    await tx.delete(projectIngredientPacks).where(eq(projectIngredientPacks.projectId, projectId));
    const packs = selected.filter((pack) => pack !== undefined);
    if (packs.length) {
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
  });
  return (
    await db
      .select()
      .from(projectIngredientPacks)
      .where(eq(projectIngredientPacks.projectId, projectId))
  ).map(projectPackResponse);
}

export async function handleCatalogRoutes(
  db: LocalDatabase,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown | null> {
  if (path === "/api/ingredient-pack-catalog" && method === "GET") return catalog(db);
  if (path === "/api/ingredient-packs" && method === "GET") return (await catalog(db)).packs;

  if (path === "/api/ingredient-pack-categories" && method === "POST") {
    const input = createIngredientPackCategoryInputSchema.parse(body);
    const current = await catalog(db);
    if (current.categories.some((item) => normalize(item.name) === normalize(input.name))) {
      conflict("An ingredient pack category with that name already exists.");
    }
    const [created] = await db
      .insert(ingredientPackCatalogNodes)
      .values({
        id: crypto.randomUUID(),
        kind: "category",
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
      })
      .returning();
    if (!created) throw new AppError("Category creation failed.", "DATABASE_ERROR");
    return nodeResponse(created);
  }

  if (path === "/api/ingredient-pack-collections" && method === "POST") {
    const input = createIngredientPackCollectionInputSchema.parse(body);
    const current = await catalog(db);
    if (!current.categories.some((item) => item.id === input.categoryId)) {
      throw new AppError("Parent category was not found.", "BAD_REQUEST");
    }
    const [created] = await db
      .insert(ingredientPackCatalogNodes)
      .values({
        id: crypto.randomUUID(),
        kind: "collection",
        parentId: input.categoryId,
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
      })
      .returning();
    if (!created) throw new AppError("Collection creation failed.", "DATABASE_ERROR");
    return nodeResponse(created);
  }

  const nodeMatch = path.match(/^\/api\/ingredient-pack-(categories|collections)\/([0-9a-f-]+)$/i);
  if (nodeMatch) {
    const kind = nodeMatch[1] === "categories" ? "category" : "collection";
    const id = nodeMatch[2] as string;
    const [node] = await db
      .select()
      .from(ingredientPackCatalogNodes)
      .where(and(eq(ingredientPackCatalogNodes.id, id), eq(ingredientPackCatalogNodes.kind, kind)))
      .limit(1);
    if (!node) notFound(`Custom ingredient pack ${kind} not found.`);
    if (method === "PATCH") {
      const input =
        kind === "category"
          ? updateIngredientPackCategoryInputSchema.parse(body)
          : updateIngredientPackCollectionInputSchema.parse(body);
      const categoryId =
        kind === "collection"
          ? updateIngredientPackCollectionInputSchema.parse(body).categoryId
          : undefined;
      if (node.systemKey && categoryId !== undefined) {
        conflict("The protected Unsorted collection cannot be moved.");
      }
      const [updated] = await db
        .update(ingredientPackCatalogNodes)
        .set({
          ...(input.name !== undefined
            ? { name: input.name, normalizedName: normalize(input.name) }
            : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(categoryId !== undefined ? { parentId: categoryId } : {}),
          ...touchUpdatedAt,
        })
        .where(eq(ingredientPackCatalogNodes.id, id))
        .returning();
      if (!updated) throw new AppError("Catalog update failed.", "DATABASE_ERROR");
      return nodeResponse(updated);
    }
    if (method === "DELETE") {
      if (node.systemKey) conflict("Protected catalog nodes cannot be deleted.");
      const defaults = await ensureDefaultHierarchy(db);
      if (kind === "collection") {
        await db.transaction(async (tx) => {
          await tx
            .update(ingredientPacks)
            .set({ collectionId: defaults.collection.id, ...touchUpdatedAt })
            .where(eq(ingredientPacks.collectionId, id));
          await tx.delete(ingredientPackCatalogNodes).where(eq(ingredientPackCatalogNodes.id, id));
        });
      } else {
        const children = defaults.rows.filter(
          (item) => item.kind === "collection" && item.parentId === id,
        );
        await db.transaction(async (tx) => {
          if (children.length) {
            await tx
              .update(ingredientPacks)
              .set({ collectionId: defaults.collection.id, ...touchUpdatedAt })
              .where(
                inArray(
                  ingredientPacks.collectionId,
                  children.map((item) => item.id),
                ),
              );
            await tx.delete(ingredientPackCatalogNodes).where(
              inArray(
                ingredientPackCatalogNodes.id,
                children.map((item) => item.id),
              ),
            );
          }
          await tx.delete(ingredientPackCatalogNodes).where(eq(ingredientPackCatalogNodes.id, id));
        });
      }
      return undefined;
    }
  }

  if (path === "/api/ingredient-packs" && method === "POST") {
    const input = createIngredientPackInputSchema.parse(body);
    if (!(await catalog(db)).collections.some((item) => item.id === input.collectionId)) {
      throw new AppError("Parent collection was not found.", "BAD_REQUEST");
    }
    const [created] = await db
      .insert(ingredientPacks)
      .values({
        id: crypto.randomUUID(),
        name: input.name,
        normalizedName: normalize(input.name),
        description: input.description ?? "",
        collectionId: input.collectionId,
        values: input.values,
      })
      .returning();
    if (!created) throw new AppError("Ingredient pack creation failed.", "DATABASE_ERROR");
    return customPackResponse(created, input.collectionId);
  }

  const packMatch = path.match(/^\/api\/ingredient-packs\/([0-9a-f-]+)$/i);
  if (packMatch) {
    const id = packMatch[1] as string;
    const [pack] = await db
      .select()
      .from(ingredientPacks)
      .where(eq(ingredientPacks.id, id))
      .limit(1);
    if (!pack) notFound("Custom ingredient pack not found.");
    if (method === "PATCH") {
      const input = updateIngredientPackInputSchema.parse(body);
      const [updated] = await db
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
        .where(eq(ingredientPacks.id, id))
        .returning();
      if (!updated) throw new AppError("Ingredient pack update failed.", "DATABASE_ERROR");
      return customPackResponse(updated, (await ensureDefaultHierarchy(db)).collection.id);
    }
    if (method === "DELETE") {
      await db.delete(ingredientPacks).where(eq(ingredientPacks.id, id));
      return undefined;
    }
  }

  const projectPacks = path.match(/^\/api\/projects\/([0-9a-f-]+)\/ingredient-packs$/i);
  if (projectPacks) {
    const projectId = projectPacks[1] as string;
    if (method === "GET") {
      await requireProject(db, projectId);
      return (
        await db
          .select()
          .from(projectIngredientPacks)
          .where(eq(projectIngredientPacks.projectId, projectId))
      ).map(projectPackResponse);
    }
    if (method === "PUT") {
      const input = syncProjectIngredientPacksInputSchema.parse(body);
      return syncProjectPacks(db, projectId, input.ingredientPackIds);
    }
  }

  return null;
}
