import { z } from "zod";
import { tiptapDocumentSchema } from "./manuscript.js";
import { idSchema, timestampSchema } from "./primitives.js";

export const activationModeSchema = z.enum(["mention", "always", "never"]);

export const compendiumTypeIdSchema = z.enum([
  "story.character",
  "story.location",
  "story.object",
  "story.faction",
  "story.lore",
  "project.premise",
  "project.genres",
  "project.themes",
  "project.tags",
  "project.instructions",
]);

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
    activationMode: true,
    caseSensitive: true,
    content: true,
  })
  .partial({ aliases: true, activationMode: true, caseSensitive: true });

export const updateCompendiumEntryInputSchema = createCompendiumEntryInputSchema.partial().extend({
  expectedRevision: z.number().int().positive(),
});

export const contextFragmentSchema = z.object({
  id: z.string(),
  entryId: idSchema,
  entryName: z.string(),
  text: z.string(),
  activationSource: z.enum(["direct", "scene_presence", "always", "recursive"]),
  recursionDepth: z.number().int().nonnegative(),
  priority: z.number(),
});

export type CompendiumEntry = z.infer<typeof compendiumEntrySchema>;
export type CompendiumContent = z.infer<typeof compendiumContentSchema>;
export type ContextFragment = z.infer<typeof contextFragmentSchema>;
