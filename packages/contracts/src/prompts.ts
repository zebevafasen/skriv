import { z } from "zod";
import { idSchema, timestampSchema } from "./primitives.js";

export const workflowKeySchema = z.enum([
  "prose.start",
  "prose.continue",
  "prose.toward_event",
  "ideation.premise",
  "context.extract",
]);

export const promptRoleSchema = z.enum(["system", "developer", "user", "assistant"]);

export const promptMessageSchema = z.object({
  role: promptRoleSchema,
  content: z.string().min(1),
});

export const promptDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  workflow: workflowKeySchema,
  version: z.number().int().positive(),
  description: z.string().max(2_000),
  ownership: z.enum(["builtin", "user"]),
  ownerId: idSchema.nullable(),
  sourcePromptId: z.string().nullable(),
  messages: z.array(promptMessageSchema).min(1),
  variables: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)),
  createdAt: timestampSchema.nullable(),
  updatedAt: timestampSchema.nullable(),
});

export const createPromptInputSchema = promptDefinitionSchema
  .pick({ name: true, workflow: true, description: true, messages: true, variables: true })
  .extend({ sourcePromptId: z.string().nullable().default(null) });

export const updatePromptInputSchema = createPromptInputSchema.partial();

export const workflowVariables: Record<z.infer<typeof workflowKeySchema>, readonly string[]> = {
  "prose.start": ["context_package", "scene_context", "user_instructions", "target_length"],
  "prose.continue": [
    "context_package",
    "manuscript_before_cursor",
    "manuscript_after_cursor",
    "user_instructions",
    "target_length",
  ],
  "prose.toward_event": [
    "context_package",
    "manuscript_before_cursor",
    "manuscript_after_cursor",
    "event_target",
    "user_instructions",
    "target_length",
  ],
  "ideation.premise": ["genres", "themes", "tags", "user_instructions"],
  "context.extract": ["request_context", "candidate_fragments"],
};

export type WorkflowKey = z.infer<typeof workflowKeySchema>;
export type PromptDefinition = z.infer<typeof promptDefinitionSchema>;
export type PromptMessage = z.infer<typeof promptMessageSchema>;
