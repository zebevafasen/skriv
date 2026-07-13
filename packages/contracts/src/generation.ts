import { z } from "zod";
import { tiptapDocumentSchema } from "./manuscript.js";
import { idSchema } from "./primitives.js";

export const lengthUnitSchema = z.enum(["words", "paragraphs"]);
export const selectionActionSchema = z.enum(["expand", "shorten", "rephrase", "polish", "custom"]);

const generationRequestBaseSchema = z.object({
  sceneId: idSchema,
  sceneVersion: z.number().int().positive(),
  cursorPosition: z.number().int().nonnegative(),
  manuscriptBeforeCursor: z.string().max(100_000),
  manuscriptAfterCursor: z.string().max(50_000),
  instructions: z.string().max(20_000).default(""),
  eventTarget: z.string().max(20_000).default(""),
  targetLength: z.number().int().min(1).max(10_000).nullable(),
  lengthUnit: lengthUnitSchema,
  modelOverride: z.string().min(1).nullable().default(null),
  promptOverrideId: z.string().min(1).nullable().default(null),
});

const insertionGenerationRequestSchema = generationRequestBaseSchema
  .extend({
    workflow: z.enum(["prose.start", "prose.continue", "prose.toward_event"]),
  })
  .superRefine((value, context) => {
    if (value.workflow === "prose.toward_event" && !value.eventTarget.trim()) {
      context.addIssue({
        code: "custom",
        path: ["eventTarget"],
        message: "An event target is required.",
      });
    }
  });

export const selectionGenerationRequestSchema = generationRequestBaseSchema
  .extend({
    workflow: z.literal("prose.revise_selection"),
    selectionAction: selectionActionSchema,
    selectedText: z.string().trim().min(1).max(100_000),
  })
  .superRefine((value, context) => {
    if (value.selectionAction === "custom" && !value.instructions.trim()) {
      context.addIssue({
        code: "custom",
        path: ["instructions"],
        message: "Custom selection revisions require instructions.",
      });
    }
  });

export const generationRequestSchema = z.union([
  insertionGenerationRequestSchema,
  selectionGenerationRequestSchema,
]);

const streamBaseSchema = z.object({
  generationId: idSchema,
  sequence: z.number().int().nonnegative(),
});
export const generationStreamEventSchema = z.discriminatedUnion("type", [
  streamBaseSchema.extend({
    type: z.literal("generation.started"),
    model: z.string(),
    promptId: z.string(),
  }),
  streamBaseSchema.extend({ type: z.literal("generation.delta"), delta: z.string() }),
  streamBaseSchema.extend({
    type: z.literal("generation.continuing"),
    continuation: z.number().int().positive(),
  }),
  streamBaseSchema.extend({
    type: z.literal("generation.completed"),
    candidateText: z.string(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    contextFallback: z.boolean(),
  }),
  streamBaseSchema.extend({
    type: z.literal("generation.failed"),
    message: z.string(),
    retryable: z.boolean(),
  }),
  streamBaseSchema.extend({ type: z.literal("generation.cancelled") }),
]);

export const acceptGenerationInputSchema = z.object({
  expectedSceneVersion: z.number().int().positive(),
  document: tiptapDocumentSchema,
  plainText: z.string().max(2_000_000),
});

export const regenerateInputSchema = z.object({ instructions: z.string().max(20_000).optional() });

export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationStreamEvent = z.infer<typeof generationStreamEventSchema>;
export type SelectionAction = z.infer<typeof selectionActionSchema>;
