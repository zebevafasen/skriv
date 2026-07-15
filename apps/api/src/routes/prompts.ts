import { basePackage, getBuiltinPrompt } from "@skriv/content";
import {
  createPromptInputSchema,
  promptDefinitionSchema,
  updatePromptInputSchema,
  workflowKeySchema,
} from "@skriv/contracts";
import { validatePromptDefinition } from "@skriv/core";
import { promptDefinitions, touchUpdatedAt, workflowBindings } from "@skriv/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";

const promptParams = z.object({ id: z.string().min(1) });
const bindInputSchema = z.object({ workflow: workflowKeySchema, promptId: z.string().nullable() });

function userPromptResponse(row: typeof promptDefinitions.$inferSelect) {
  return promptDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    workflow: row.workflow,
    version: row.version,
    description: row.description,
    ownership: "user",
    sourcePromptId: row.sourcePromptId,
    messages: row.messages,
    variables: row.variables,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function resolvePrompt(
  context: AppContext,
  userId: string,
  workflow: z.infer<typeof workflowKeySchema>,
  overrideId?: string | null,
) {
  if (overrideId) {
    const builtin = basePackage.prompts.find(
      (prompt) => prompt.id === overrideId && prompt.workflow === workflow,
    );
    if (builtin) return builtin;
    const [userPrompt] = await context.db
      .select()
      .from(promptDefinitions)
      .where(
        and(
          eq(promptDefinitions.id, overrideId),
          eq(promptDefinitions.ownerId, userId),
          eq(promptDefinitions.workflow, workflow),
        ),
      )
      .limit(1);
    if (userPrompt) return userPromptResponse(userPrompt);
    throw Object.assign(new Error("Prompt override not found or incompatible."), {
      statusCode: 400,
    });
  }
  const [binding] = await context.db
    .select()
    .from(workflowBindings)
    .where(and(eq(workflowBindings.userId, userId), eq(workflowBindings.workflow, workflow)))
    .limit(1);
  if (binding?.promptDefinitionId) {
    const [userPrompt] = await context.db
      .select()
      .from(promptDefinitions)
      .where(
        and(
          eq(promptDefinitions.id, binding.promptDefinitionId),
          eq(promptDefinitions.ownerId, userId),
        ),
      )
      .limit(1);
    if (userPrompt) return userPromptResponse(userPrompt);
  }
  if (binding?.builtinPromptId) {
    const builtin = basePackage.prompts.find(
      (prompt) => prompt.id === binding.builtinPromptId && prompt.workflow === workflow,
    );
    if (builtin) return builtin;
  }
  return getBuiltinPrompt(workflow);
}

export async function registerPromptRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/prompts", async (request) => {
    const userRows = await context.db
      .select()
      .from(promptDefinitions)
      .where(eq(promptDefinitions.ownerId, request.userId));
    const bindings = await context.db
      .select()
      .from(workflowBindings)
      .where(eq(workflowBindings.userId, request.userId));
    return { prompts: [...basePackage.prompts, ...userRows.map(userPromptResponse)], bindings };
  });

  app.post("/api/prompts", async (request, reply) => {
    const input = parseWith(createPromptInputSchema, request.body);
    const candidate = promptDefinitionSchema.parse({
      id: crypto.randomUUID(),
      ...input,
      ownership: "user",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const issues = validatePromptDefinition(candidate);
    if (issues.length)
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Prompt is invalid.", details: issues },
      });
    const [created] = await context.db
      .insert(promptDefinitions)
      .values({
        ownerId: request.userId,
        sourcePromptId: input.sourcePromptId,
        name: input.name,
        workflow: input.workflow,
        description: input.description,
        messages: input.messages,
        variables: input.variables,
      })
      .returning();
    if (!created) throw new Error("Prompt creation failed.");
    return reply.code(201).send(userPromptResponse(created));
  });

  app.post("/api/prompts/:id/copy", async (request, reply) => {
    const { id } = parseWith(promptParams, request.params);
    const source = basePackage.prompts.find((prompt) => prompt.id === id);
    if (!source) return notFound(reply, "Built-in prompt not found.");
    const [created] = await context.db
      .insert(promptDefinitions)
      .values({
        ownerId: request.userId,
        sourcePromptId: source.id,
        name: `${source.name} Copy`,
        workflow: source.workflow,
        description: source.description,
        messages: source.messages,
        variables: source.variables,
      })
      .returning();
    if (!created) throw new Error("Prompt copy failed.");
    return reply.code(201).send(userPromptResponse(created));
  });

  app.patch("/api/prompts/:id", async (request, reply) => {
    const { id } = parseWith(promptParams, request.params);
    const input = parseWith(updatePromptInputSchema, request.body);
    const [existing] = await context.db
      .select()
      .from(promptDefinitions)
      .where(and(eq(promptDefinitions.id, id), eq(promptDefinitions.ownerId, request.userId)))
      .limit(1);
    if (!existing)
      return notFound(
        reply,
        "User prompt not found. Built-in prompts must be copied before editing.",
      );
    const merged = userPromptResponse({
      ...existing,
      sourcePromptId: input.sourcePromptId ?? existing.sourcePromptId,
      name: input.name ?? existing.name,
      workflow: input.workflow ?? existing.workflow,
      description: input.description ?? existing.description,
      messages: input.messages ?? existing.messages,
      variables: input.variables ?? existing.variables,
      updatedAt: new Date(),
    });
    const issues = validatePromptDefinition(merged);
    if (issues.length)
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Prompt is invalid.", details: issues },
      });
    const [updated] = await context.db
      .update(promptDefinitions)
      .set({ ...input, version: existing.version + 1, ...touchUpdatedAt })
      .where(eq(promptDefinitions.id, id))
      .returning();
    if (!updated) throw new Error("Prompt update failed.");
    return userPromptResponse(updated);
  });

  app.delete("/api/prompts/:id", async (request, reply) => {
    const { id } = parseWith(promptParams, request.params);
    const [removed] = await context.db
      .delete(promptDefinitions)
      .where(and(eq(promptDefinitions.id, id), eq(promptDefinitions.ownerId, request.userId)))
      .returning({ id: promptDefinitions.id });
    if (!removed)
      return notFound(reply, "User prompt not found. Built-in prompts cannot be deleted.");
    return reply.code(204).send();
  });

  app.put("/api/prompt-bindings", async (request, reply) => {
    const input = parseWith(bindInputSchema, request.body);
    if (input.promptId)
      await resolvePrompt(context, request.userId, input.workflow, input.promptId);
    const builtin = input.promptId
      ? basePackage.prompts.some((prompt) => prompt.id === input.promptId)
      : false;
    await context.db
      .insert(workflowBindings)
      .values({
        userId: request.userId,
        workflow: input.workflow,
        promptDefinitionId: input.promptId && !builtin ? input.promptId : null,
        builtinPromptId: input.promptId && builtin ? input.promptId : null,
      })
      .onConflictDoUpdate({
        target: [workflowBindings.userId, workflowBindings.workflow],
        set: {
          promptDefinitionId: input.promptId && !builtin ? input.promptId : null,
          builtinPromptId: input.promptId && builtin ? input.promptId : null,
          updatedAt: new Date(),
        },
      });
    return reply.code(204).send();
  });
}
