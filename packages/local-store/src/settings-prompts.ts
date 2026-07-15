import { AppError } from "@asterism/application";
import { basePackage } from "@asterism/content";
import {
  aiSettingsSchema,
  appSettingsSchema,
  createPromptInputSchema,
  editorSettingsSchema,
  promptDefinitionSchema,
  updateAiSettingsInputSchema,
  updateAppSettingsInputSchema,
  updateEditorSettingsInputSchema,
  updatePromptInputSchema,
  workflowKeySchema,
} from "@asterism/contracts";
import { validatePromptDefinition } from "@asterism/core";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { LocalDatabase } from "./database.js";
import {
  aiSettings,
  appSettings,
  editorSettings,
  promptDefinitions,
  touchUpdatedAt,
  workflowBindings,
} from "./schema.js";

const bindingSchema = z.object({ workflow: workflowKeySchema, promptId: z.string().nullable() });
const defaultAiSettings = aiSettingsSchema.parse({
  baseModel: "openrouter/auto",
  contextModel: "openrouter/auto",
  smartContextEnabled: true,
  recursionDepth: 2,
});

function promptResponse(row: typeof promptDefinitions.$inferSelect) {
  return promptDefinitionSchema.parse({ ...row, ownership: "user" });
}

function validatePrompt(candidate: ReturnType<typeof promptDefinitionSchema.parse>) {
  const issues = validatePromptDefinition(candidate);
  if (issues.length) {
    throw new AppError("Prompt is invalid.", "VALIDATION_ERROR", issues);
  }
  return candidate;
}

export async function handleSettingsAndPrompts(
  db: LocalDatabase,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown | null> {
  if (path === "/api/settings/ai") {
    const [currentRow] = await db.select().from(aiSettings).where(eq(aiSettings.id, 1)).limit(1);
    const current = aiSettingsSchema.parse(
      currentRow?.baseModel && currentRow.contextModel ? currentRow : defaultAiSettings,
    );
    if (method === "GET") return current;
    if (method === "PATCH") {
      const next = aiSettingsSchema.parse({
        ...current,
        ...updateAiSettingsInputSchema.parse(body),
      });
      await db
        .insert(aiSettings)
        .values({ id: 1, ...next })
        .onConflictDoUpdate({ target: aiSettings.id, set: { ...next, ...touchUpdatedAt } });
      return next;
    }
  }

  if (path === "/api/settings/app") {
    const [currentRow] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);
    const current = appSettingsSchema.parse(currentRow ?? {});
    if (method === "GET") return current;
    if (method === "PATCH") {
      const next = appSettingsSchema.parse({
        ...current,
        ...updateAppSettingsInputSchema.parse(body),
      });
      await db
        .insert(appSettings)
        .values({ id: 1, ...next })
        .onConflictDoUpdate({ target: appSettings.id, set: { ...next, ...touchUpdatedAt } });
      return next;
    }
  }

  if (path === "/api/settings/editor") {
    const [currentRow] = await db
      .select()
      .from(editorSettings)
      .where(eq(editorSettings.id, 1))
      .limit(1);
    const current = editorSettingsSchema.parse(currentRow ?? {});
    if (method === "GET") return current;
    if (method === "PATCH") {
      const next = editorSettingsSchema.parse({
        ...current,
        ...updateEditorSettingsInputSchema.parse(body),
      });
      await db
        .insert(editorSettings)
        .values({ id: 1, ...next })
        .onConflictDoUpdate({ target: editorSettings.id, set: { ...next, ...touchUpdatedAt } });
      return next;
    }
  }

  if (path === "/api/prompts" && method === "GET") {
    const rows = await db.select().from(promptDefinitions);
    return {
      prompts: [...basePackage.prompts, ...rows.map(promptResponse)],
      bindings: await db.select().from(workflowBindings),
    };
  }

  if (path === "/api/prompts" && method === "POST") {
    const input = createPromptInputSchema.parse(body);
    const now = new Date().toISOString();
    const candidate = validatePrompt(
      promptDefinitionSchema.parse({
        id: crypto.randomUUID(),
        ...input,
        ownership: "user",
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const [created] = await db
      .insert(promptDefinitions)
      .values({
        id: candidate.id,
        sourcePromptId: candidate.sourcePromptId,
        name: candidate.name,
        workflow: candidate.workflow,
        description: candidate.description,
        messages: candidate.messages,
        variables: candidate.variables,
      })
      .returning();
    if (!created) throw new AppError("Prompt creation failed.", "DATABASE_ERROR");
    return promptResponse(created);
  }

  const copyMatch = path.match(/^\/api\/prompts\/([^/]+)\/copy$/);
  if (copyMatch && method === "POST") {
    const source = basePackage.prompts.find((prompt) => prompt.id === copyMatch[1]);
    if (!source) throw new AppError("Built-in prompt not found.", "NOT_FOUND");
    const [created] = await db
      .insert(promptDefinitions)
      .values({
        id: crypto.randomUUID(),
        sourcePromptId: source.id,
        name: `${source.name} Copy`,
        workflow: source.workflow,
        description: source.description,
        messages: source.messages,
        variables: source.variables,
      })
      .returning();
    if (!created) throw new AppError("Prompt copy failed.", "DATABASE_ERROR");
    return promptResponse(created);
  }

  const promptMatch = path.match(/^\/api\/prompts\/([0-9a-f-]+)$/i);
  if (promptMatch && method === "PATCH") {
    const [existing] = await db
      .select()
      .from(promptDefinitions)
      .where(eq(promptDefinitions.id, promptMatch[1] as string))
      .limit(1);
    if (!existing) {
      throw new AppError(
        "Custom prompt not found. Built-in prompts must be copied before editing.",
        "NOT_FOUND",
      );
    }
    const input = updatePromptInputSchema.parse(body);
    const candidate = validatePrompt(
      promptDefinitionSchema.parse({
        ...promptResponse(existing),
        ...input,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      }),
    );
    const [updated] = await db
      .update(promptDefinitions)
      .set({
        sourcePromptId: candidate.sourcePromptId,
        name: candidate.name,
        workflow: candidate.workflow,
        description: candidate.description,
        messages: candidate.messages,
        variables: candidate.variables,
        version: candidate.version,
        ...touchUpdatedAt,
      })
      .where(eq(promptDefinitions.id, existing.id))
      .returning();
    if (!updated) throw new AppError("Prompt update failed.", "DATABASE_ERROR");
    return promptResponse(updated);
  }

  if (promptMatch && method === "DELETE") {
    const [removed] = await db
      .delete(promptDefinitions)
      .where(eq(promptDefinitions.id, promptMatch[1] as string))
      .returning({ id: promptDefinitions.id });
    if (!removed) {
      throw new AppError(
        "Custom prompt not found. Built-in prompts cannot be deleted.",
        "NOT_FOUND",
      );
    }
    return undefined;
  }

  if (path === "/api/prompt-bindings" && method === "PUT") {
    const input = bindingSchema.parse(body);
    let builtinPromptId: string | null = null;
    let promptDefinitionId: string | null = null;
    if (input.promptId) {
      const builtin = basePackage.prompts.find(
        (prompt) => prompt.id === input.promptId && prompt.workflow === input.workflow,
      );
      if (builtin) builtinPromptId = builtin.id;
      else {
        const [custom] = await db
          .select()
          .from(promptDefinitions)
          .where(eq(promptDefinitions.id, input.promptId))
          .limit(1);
        if (!custom || custom.workflow !== input.workflow) {
          throw new AppError("Prompt is missing or belongs to another workflow.", "BAD_REQUEST");
        }
        promptDefinitionId = custom.id;
      }
    }
    await db
      .insert(workflowBindings)
      .values({ workflow: input.workflow, builtinPromptId, promptDefinitionId })
      .onConflictDoUpdate({
        target: workflowBindings.workflow,
        set: { builtinPromptId, promptDefinitionId, ...touchUpdatedAt },
      });
    return undefined;
  }

  return null;
}
