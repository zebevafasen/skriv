import { z } from "zod";
import { tiptapDocumentSchema } from "./manuscript.js";
import { idSchema } from "./primitives.js";

export const lengthUnitSchema = z.enum(["words", "paragraphs"]);

export const generationRequestSchema = z
  .object({
    sceneId: idSchema,
    sceneVersion: z.number().int().positive(),
    workflow: z.enum(["prose.start", "prose.continue", "prose.toward_event"]),
    cursorPosition: z.number().int().nonnegative(),
    manuscriptBeforeCursor: z.string().max(100_000),
    manuscriptAfterCursor: z.string().max(50_000),
    instructions: z.string().max(20_000).default(""),
    eventTarget: z.string().max(20_000).default(""),
    targetLength: z.number().int().min(1).max(10_000).nullable(),
    lengthUnit: lengthUnitSchema,
    modelOverride: z.string().min(1).nullable().default(null),
    promptOverrideId: z.string().min(1).nullable().default(null),
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
