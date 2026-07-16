import { z } from "zod";
import { promptDefinitionSchema } from "./prompts.js";

export const definitionItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(1_000).default(""),
});

export const ingredientPackValuesSchema = z.object({
  genres: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const ingredientPackCategoryDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).default(""),
});

export const ingredientPackCollectionDefinitionSchema =
  ingredientPackCategoryDefinitionSchema.extend({
    categoryId: ingredientPackCategoryDefinitionSchema.shape.id,
  });

export const builtinIngredientPackSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  collectionId: ingredientPackCategoryDefinitionSchema.shape.id,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).default(""),
  values: ingredientPackValuesSchema,
});

export const contentPackageSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  name: z.string().min(1),
  schemaVersion: z.literal(2),
  contentVersion: z.number().int().positive(),
  compatibilityVersion: z.literal(1),
  genres: z.array(definitionItemSchema),
  themes: z.array(definitionItemSchema),
  tags: z.array(definitionItemSchema),
  ingredientPackCategories: z.array(ingredientPackCategoryDefinitionSchema).default([]),
  ingredientPackCollections: z.array(ingredientPackCollectionDefinitionSchema).default([]),
  ingredientPacks: z.array(builtinIngredientPackSchema).default([]),
  prompts: z.array(promptDefinitionSchema),
});

export type ContentPackage = z.infer<typeof contentPackageSchema>;
export type DefinitionItem = z.infer<typeof definitionItemSchema>;
export type IngredientPackValues = z.infer<typeof ingredientPackValuesSchema>;
export type IngredientPackCategoryDefinition = z.infer<
  typeof ingredientPackCategoryDefinitionSchema
>;
export type IngredientPackCollectionDefinition = z.infer<
  typeof ingredientPackCollectionDefinitionSchema
>;
export type BuiltinIngredientPack = z.infer<typeof builtinIngredientPackSchema>;
