import {
  compendiumCategorySchema,
  createCompendiumCategoryInputSchema,
  updateCompendiumCategoryInputSchema,
} from "@asterism/contracts";
import { compendiumCategories, compendiumEntries, touchUpdatedAt } from "@asterism/db";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const projectParams = z.object({ projectId: z.uuid() });
const categoryParams = z.object({ id: z.uuid() });
const importSchema = z.object({
  sourceProjectId: z.uuid(),
  categoryIds: z.array(z.uuid()).max(100),
});
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
const reservedNames = new Set([
  "character",
  "location",
  "object / item",
  "faction",
  "lore",
  "other",
  "project metadata",
]);
function ensureAvailableName(name: string) {
  if (reservedNames.has(normalize(name))) {
    throw Object.assign(new Error("That name is reserved for a standard Compendium category."), {
      statusCode: 400,
    });
  }
}
const response = (row: typeof compendiumCategories.$inferSelect) =>
  compendiumCategorySchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

export async function registerCategoryRoutes(app: FastifyInstance, context: AppContext) {
  app.get("/api/projects/:projectId/compendium-categories", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const rows = await context.db
      .select()
      .from(compendiumCategories)
      .where(eq(compendiumCategories.projectId, projectId))
      .orderBy(asc(compendiumCategories.position), asc(compendiumCategories.name));
    return rows.map(response);
  });

  app.post("/api/projects/:projectId/compendium-categories", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(createCompendiumCategoryInputSchema, request.body);
    ensureAvailableName(input.name);
    const [last] = await context.db
      .select({ value: max(compendiumCategories.position) })
      .from(compendiumCategories)
      .where(eq(compendiumCategories.projectId, projectId));
    const [created] = await context.db
      .insert(compendiumCategories)
      .values({
        projectId,
        name: input.name,
        normalizedName: normalize(input.name),
        position: (last?.value ?? -1) + 1,
      })
      .returning();
    if (!created) throw new Error("Category creation failed.");
    return reply.code(201).send(response(created));
  });

  app.patch("/api/compendium-categories/:id", async (request, reply) => {
    const { id } = parseWith(categoryParams, request.params);
    const input = parseWith(updateCompendiumCategoryInputSchema, request.body);
    ensureAvailableName(input.name);
    const [category] = await context.db
      .select()
      .from(compendiumCategories)
      .where(eq(compendiumCategories.id, id))
      .limit(1);
    if (!category || !(await ownsProject(context, request.userId, category.projectId)))
      return notFound(reply, "Category not found.");
    const [updated] = await context.db
      .update(compendiumCategories)
      .set({ name: input.name, normalizedName: normalize(input.name), ...touchUpdatedAt })
      .where(eq(compendiumCategories.id, id))
      .returning();
    if (!updated) throw new Error("Category update failed.");
    return response(updated);
  });

  app.delete("/api/compendium-categories/:id", async (request, reply) => {
    const { id } = parseWith(categoryParams, request.params);
    const [category] = await context.db
      .select()
      .from(compendiumCategories)
      .where(eq(compendiumCategories.id, id))
      .limit(1);
    if (!category || !(await ownsProject(context, request.userId, category.projectId)))
      return notFound(reply, "Category not found.");
    await context.db.transaction(async (tx) => {
      await tx
        .update(compendiumEntries)
        .set({ typeId: "story.other", ...touchUpdatedAt })
        .where(
          and(
            eq(compendiumEntries.projectId, category.projectId),
            eq(compendiumEntries.typeId, `custom.${id}`),
          ),
        );
      await tx.delete(compendiumCategories).where(eq(compendiumCategories.id, id));
    });
    return reply.code(204).send();
  });

  app.post("/api/projects/:projectId/compendium-categories/import", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    const input = parseWith(importSchema, request.body);
    if (
      !(await ownsProject(context, request.userId, projectId)) ||
      !(await ownsProject(context, request.userId, input.sourceProjectId))
    )
      return notFound(reply, "Project not found.");
    const source = input.categoryIds.length
      ? await context.db
          .select()
          .from(compendiumCategories)
          .where(
            and(
              eq(compendiumCategories.projectId, input.sourceProjectId),
              inArray(compendiumCategories.id, input.categoryIds),
            ),
          )
      : [];
    const existing = await context.db
      .select()
      .from(compendiumCategories)
      .where(eq(compendiumCategories.projectId, projectId));
    const names = new Set(existing.map((item) => item.normalizedName));
    const imported: string[] = [];
    const skipped: string[] = [];
    let position = existing.reduce((value, item) => Math.max(value, item.position), -1) + 1;
    for (const item of source) {
      if (names.has(item.normalizedName)) {
        skipped.push(item.name);
        continue;
      }
      await context.db.insert(compendiumCategories).values({
        projectId,
        name: item.name,
        normalizedName: item.normalizedName,
        position: position++,
      });
      names.add(item.normalizedName);
      imported.push(item.name);
    }
    return { imported, skipped };
  });
}
