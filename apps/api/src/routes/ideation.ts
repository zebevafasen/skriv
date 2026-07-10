import { basePackage } from "@asterism/content";
import { compendiumContentSchema, workflowKeySchema } from "@asterism/contracts";
import { protectedProtocolMessage, renderPrompt } from "@asterism/core";
import {
  compendiumEntries,
  packageSettings,
  touchUpdatedAt,
  usageEvents,
  userCollections,
  userDefinitions,
} from "@asterism/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";
import { resolvePrompt } from "./prompts.js";
import { getSettings } from "./settings.js";

const projectParams = z.object({ projectId: z.uuid() });
const metadataUpdateSchema = z.object({
  premise: z.string().max(50_000).optional(),
  genres: z
    .array(
      z.object({
        definitionId: z.string().nullable(),
        label: z.string().min(1),
        locked: z.boolean().default(false),
      }),
    )
    .optional(),
  themes: z
    .array(
      z.object({
        definitionId: z.string().nullable(),
        label: z.string().min(1),
        locked: z.boolean().default(false),
      }),
    )
    .optional(),
  tags: z
    .array(
      z.object({
        definitionId: z.string().nullable(),
        label: z.string().min(1),
        locked: z.boolean().default(false),
      }),
    )
    .optional(),
  instructions: z.string().max(50_000).optional(),
});
const premiseRequestSchema = z.object({
  instructions: z.string().max(20_000).default(""),
  modelOverride: z.string().nullable().default(null),
  count: z.number().int().min(1).max(5).default(3),
});
const collectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["genre", "theme", "tag"]),
  values: z.array(z.object({ definitionId: z.string().nullable(), label: z.string().min(1) })),
});
const definitionSchema = z.object({
  kind: z.enum(["genre", "theme", "tag"]),
  label: z.string().trim().min(1).max(120),
});

async function metadataEntries(context: AppContext, projectId: string) {
  const rows = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  return new Map(
    rows.filter((row) => row.singletonKey).map((row) => [row.singletonKey as string, row]),
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
      ["premise", "genres", "themes", "tags", "instructions"].map((key) => [
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
          key === "premise" || key === "instructions"
            ? { kind: "text", text: value }
            : { kind: "selection", values: value },
        );
        await tx
          .update(compendiumEntries)
          .set({ content, revision: entry.revision + 1, ...touchUpdatedAt })
          .where(eq(compendiumEntries.id, entry.id));
      }
    });
    return reply.code(204).send();
  });

  app.post("/api/projects/:projectId/ideation/generate", async (request, reply) => {
    const { projectId } = parseWith(projectParams, request.params);
    if (!(await ownsProject(context, request.userId, projectId)))
      return notFound(reply, "Project not found.");
    const input = parseWith(premiseRequestSchema, request.body ?? {});
    const entries = await metadataEntries(context, projectId);
    const labels = (key: string) => {
      const content = entries.get(key)?.content;
      return content?.kind === "selection"
        ? content.values.map((value) => value.label).join(", ")
        : "";
    };
    const settings = await getSettings(context, request.userId);
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
        messages: [
          protectedProtocolMessage("ideation.premise"),
          ...renderPrompt(prompt, {
            genres: labels("genres"),
            themes: labels("themes"),
            tags: labels("tags"),
            user_instructions: input.instructions,
          }),
        ],
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
