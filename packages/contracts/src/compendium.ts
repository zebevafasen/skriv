import { z } from "zod";
import { tiptapDocumentSchema } from "./manuscript.js";
import { idSchema, timestampSchema } from "./primitives.js";

export const activationModeSchema = z.enum(["mention", "always", "never", "smart"]);

export const standardCompendiumTypeIdSchema = z.enum([
  "story.character",
  "story.location",
  "story.object",
  "story.faction",
  "story.lore",
  "story.other",
  "project.premise",
  "project.genres",
  "project.themes",
  "project.tags",
  "project.instructions",
]);

export const customCompendiumTypeIdSchema = z.string().regex(/^custom\.[0-9a-f-]{36}$/i);
export const compendiumTypeIdSchema = z.union([
  standardCompendiumTypeIdSchema,
  customCompendiumTypeIdSchema,
]);

export const compendiumCategorySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().trim().min(1).max(120),
  position: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const createCompendiumCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateCompendiumCategoryInputSchema = createCompendiumCategoryInputSchema;

const selectedValueSchema = z.object({
  definitionId: z.string().nullable().default(null),
  label: z.string().trim().min(1).max(200),
  locked: z.boolean().default(false),
});

export const compendiumContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rich_text"), document: tiptapDocumentSchema, plainText: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("selection"), values: z.array(selectedValueSchema) }),
]);

export const compendiumEntrySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().trim().min(1).max(300),
  typeId: compendiumTypeIdSchema,
  aliases: z.array(z.string().trim().min(1).max(300)),
  labels: z.array(z.string().trim().min(1).max(80)).max(50),
  imageDataUrl: z
    .string()
    .max(3_000_000)
    .refine(
      (value) => /^data:image\/(png|jpeg|webp|gif);base64,/.test(value),
      "Image must be a PNG, JPEG, WebP, or GIF data URL.",
    )
    .nullable(),
  trackingEnabled: z.boolean(),
  matchExclusions: z.array(z.string().trim().min(1).max(300)).max(100),
  activationMode: activationModeSchema,
  caseSensitive: z.boolean(),
  content: compendiumContentSchema,
  revision: z.number().int().positive(),
  singleton: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const createCompendiumEntryInputSchema = compendiumEntrySchema
  .pick({
    name: true,
    typeId: true,
    aliases: true,
    labels: true,
    imageDataUrl: true,
    trackingEnabled: true,
    matchExclusions: true,
    activationMode: true,
    caseSensitive: true,
    content: true,
  })
  .partial({
    aliases: true,
    labels: true,
    imageDataUrl: true,
    trackingEnabled: true,
    matchExclusions: true,
    activationMode: true,
    caseSensitive: true,
  });

export const updateCompendiumEntryInputSchema = createCompendiumEntryInputSchema.partial().extend({
  expectedRevision: z.number().int().positive(),
});

export const contextFragmentSchema = z.object({
  id: z.string(),
  entryId: idSchema,
  entryName: z.string(),
  text: z.string(),
  activationSource: z.enum(["direct", "scene_presence", "always", "recursive", "smart"]),
  recursionDepth: z.number().int().nonnegative(),
  priority: z.number(),
});

export type CompendiumEntry = z.infer<typeof compendiumEntrySchema>;
export type CompendiumContent = z.infer<typeof compendiumContentSchema>;
export type ContextFragment = z.infer<typeof contextFragmentSchema>;
export type CompendiumCategory = z.infer<typeof compendiumCategorySchema>;
export type CompendiumTypeId = z.infer<typeof compendiumTypeIdSchema>;

export const extractedCompendiumTypeIdSchema = z.enum([
  "story.character",
  "story.location",
  "story.object",
  "story.faction",
  "story.lore",
  "story.other",
]);

export const extractedCompendiumDraftSchema = z.object({
  name: z.string().trim().min(1).max(300),
  typeId: extractedCompendiumTypeIdSchema,
  description: z.string().trim().min(1).max(10_000),
  evidence: z.string().trim().min(1).max(2_000),
});

export const extractCompendiumFromTextInputSchema = z.object({
  text: z.string().min(1).max(2_000_000),
  modelOverride: z.string().min(1).nullable().default(null),
});

export const extractCompendiumFromTextResponseSchema = z.object({
  suggestions: z.array(
    extractedCompendiumDraftSchema.extend({
      id: idSchema,
      duplicateEntryId: idSchema.nullable(),
      duplicateEntryRevision: z.number().int().positive().nullable(),
    }),
  ),
  model: z.string(),
  promptId: z.string(),
});

export const importExtractedCompendiumFromTextInputSchema = z
  .object({
    entries: z
      .array(
        extractedCompendiumDraftSchema.omit({ evidence: true }).extend({
          existingEntryId: idSchema.nullable().default(null),
          expectedExistingRevision: z.number().int().positive().nullable().default(null),
        }),
      )
      .min(1)
      .max(30),
  })
  .superRefine((value, context) => {
    value.entries.forEach((entry, index) => {
      if (Boolean(entry.existingEntryId) !== Boolean(entry.expectedExistingRevision)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "existingEntryId"],
          message: "Existing entry id and revision must be supplied together.",
        });
      }
    });
  });

export type ExtractCompendiumFromTextInput = z.infer<typeof extractCompendiumFromTextInputSchema>;
export type ExtractCompendiumFromTextResponse = z.infer<typeof extractCompendiumFromTextResponseSchema>;
export type ImportExtractedCompendiumFromTextInput = z.infer<
  typeof importExtractedCompendiumFromTextInputSchema
>;
