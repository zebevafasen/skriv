import { z } from "zod";
import { tagPackValuesSchema } from "./packages.js";
import { idSchema, timestampSchema } from "./primitives.js";

export const storyLanguageSchema = z.enum([
  "General English",
  "American English",
  "British English",
  "Swedish",
  "Danish",
  "Norwegian",
  "Finnish",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Portuguese",
  "Dutch",
]);

export const storyLanguages = storyLanguageSchema.options;

export const projectDefaultsSchema = z.object({
  author: z.string().max(100).default(""),
  language: storyLanguageSchema.default("General English"),
});

export const tagPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).default(""),
  ownership: z.enum(["builtin", "user"]),
  values: tagPackValuesSchema,
  createdAt: timestampSchema.nullable(),
  updatedAt: timestampSchema.nullable(),
});

export const projectTagPackSchema = tagPackSchema.extend({
  sourcePackId: z.string().min(1),
  importedAt: timestampSchema,
});

export const createTagPackInputSchema = tagPackSchema
  .pick({ name: true, description: true, values: true })
  .partial({ description: true });
export const updateTagPackInputSchema = createTagPackInputSchema.partial();

export const outlineSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank") }),
  z.object({ kind: z.literal("preset"), presetId: z.enum(["three-act", "save-the-cat"]) }),
  z.object({ kind: z.literal("project"), projectId: idSchema }),
]);

export const exportFormatSchema = z.enum(["json", "markdown", "docx", "pdf"]);
export const manuscriptExportOptionsSchema = z.object({
  format: exportFormatSchema,
  titlePage: z.boolean().default(true),
  actHeadings: z.boolean().default(true),
  chapterHeadings: z.boolean().default(true),
  sceneHeadings: z.boolean().default(true),
  includeEmptyScenes: z.boolean().default(false),
});

export type ProjectDefaults = z.infer<typeof projectDefaultsSchema>;
export type TagPack = z.infer<typeof tagPackSchema>;
export type ProjectTagPack = z.infer<typeof projectTagPackSchema>;
export type OutlineSource = z.infer<typeof outlineSourceSchema>;
export type ManuscriptExportOptions = z.infer<typeof manuscriptExportOptionsSchema>;
