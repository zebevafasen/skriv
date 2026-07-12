import { z } from "zod";
import { promptDefinitionSchema } from "./prompts.js";

export const definitionItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(1_000).default(""),
});

export const tagPackValuesSchema = z.object({
  genres: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const builtinTagPackSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).default(""),
  values: tagPackValuesSchema,
});

export const contentPackageSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  name: z.string().min(1),
  schemaVersion: z.literal(1),
  contentVersion: z.number().int().positive(),
  compatibilityVersion: z.literal(1),
  genres: z.array(definitionItemSchema),
  themes: z.array(definitionItemSchema),
  tags: z.array(definitionItemSchema),
  tagPacks: z.array(builtinTagPackSchema).default([]),
  prompts: z.array(promptDefinitionSchema),
});

export type ContentPackage = z.infer<typeof contentPackageSchema>;
export type TagPackValues = z.infer<typeof tagPackValuesSchema>;
export type BuiltinTagPack = z.infer<typeof builtinTagPackSchema>;
