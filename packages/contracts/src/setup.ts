import { z } from "zod";
import { ingredientPackValuesSchema } from "./packages.js";
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

export const ingredientPackSchema = z.object({
  id: z.string().min(1),
  collectionId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).default(""),
  ownership: z.enum(["builtin", "user"]),
  values: ingredientPackValuesSchema,
  createdAt: timestampSchema.nullable(),
  updatedAt: timestampSchema.nullable(),
});

const catalogNodeBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).default(""),
  ownership: z.enum(["builtin", "user"]),
  protected: z.boolean().default(false),
  createdAt: timestampSchema.nullable(),
  updatedAt: timestampSchema.nullable(),
});

export const ingredientPackCategorySchema = catalogNodeBaseSchema;
export const ingredientPackCollectionSchema = catalogNodeBaseSchema.extend({
  categoryId: z.string().min(1),
});
export const ingredientPackCatalogSchema = z.object({
  categories: z.array(ingredientPackCategorySchema),
  collections: z.array(ingredientPackCollectionSchema),
  packs: z.array(ingredientPackSchema),
});

export const projectIngredientPackSchema = ingredientPackSchema.omit({ collectionId: true }).extend({
  sourcePackId: z.string().min(1),
  importedAt: timestampSchema,
});

export const createIngredientPackInputSchema = ingredientPackSchema
  .pick({ collectionId: true, name: true, description: true, values: true })
  .partial({ description: true });
export const updateIngredientPackInputSchema = createIngredientPackInputSchema.partial();

export const createIngredientPackCategoryInputSchema = ingredientPackCategorySchema
  .pick({ name: true, description: true })
  .partial({ description: true });
export const updateIngredientPackCategoryInputSchema = createIngredientPackCategoryInputSchema.partial();
export const createIngredientPackCollectionInputSchema = ingredientPackCollectionSchema
  .pick({ categoryId: true, name: true, description: true })
  .partial({ description: true });
export const updateIngredientPackCollectionInputSchema = createIngredientPackCollectionInputSchema.partial();
export const syncProjectIngredientPacksInputSchema = z
  .object({
    ingredientPackIds: z.array(z.string().min(1)).max(250).optional(),
    /** @deprecated Use ingredientPackIds. */
    packIds: z.array(z.string().min(1)).max(250).optional(),
  })
  .transform(({ ingredientPackIds, packIds }) => ({
    ingredientPackIds: ingredientPackIds ?? packIds ?? [],
  }));

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
export type IngredientPack = z.infer<typeof ingredientPackSchema>;
export type IngredientPackCategory = z.infer<typeof ingredientPackCategorySchema>;
export type IngredientPackCollection = z.infer<typeof ingredientPackCollectionSchema>;
export type IngredientPackCatalog = z.infer<typeof ingredientPackCatalogSchema>;
export type ProjectIngredientPack = z.infer<typeof projectIngredientPackSchema>;
export type OutlineSource = z.infer<typeof outlineSourceSchema>;
export type ManuscriptExportOptions = z.infer<typeof manuscriptExportOptionsSchema>;

/** @deprecated Use Ingredient Pack terminology. */
export const tagPackSchema = ingredientPackSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const tagPackCategorySchema = ingredientPackCategorySchema;
/** @deprecated Use Ingredient Pack terminology. */
export const tagPackCollectionSchema = ingredientPackCollectionSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const tagPackCatalogSchema = ingredientPackCatalogSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const projectTagPackSchema = projectIngredientPackSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const createTagPackInputSchema = createIngredientPackInputSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const updateTagPackInputSchema = updateIngredientPackInputSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const createTagPackCategoryInputSchema = createIngredientPackCategoryInputSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const updateTagPackCategoryInputSchema = updateIngredientPackCategoryInputSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const createTagPackCollectionInputSchema = createIngredientPackCollectionInputSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const updateTagPackCollectionInputSchema = updateIngredientPackCollectionInputSchema;
/** @deprecated Use Ingredient Pack terminology. */
export const syncProjectTagPacksInputSchema = syncProjectIngredientPacksInputSchema;
/** @deprecated Use IngredientPack. */
export type TagPack = IngredientPack;
/** @deprecated Use IngredientPackCategory. */
export type TagPackCategory = IngredientPackCategory;
/** @deprecated Use IngredientPackCollection. */
export type TagPackCollection = IngredientPackCollection;
/** @deprecated Use IngredientPackCatalog. */
export type TagPackCatalog = IngredientPackCatalog;
/** @deprecated Use ProjectIngredientPack. */
export type ProjectTagPack = ProjectIngredientPack;
