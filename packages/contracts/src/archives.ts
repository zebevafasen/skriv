import { z } from "zod";
import { chatMessageSchema, chatThreadSchema } from "./chat.js";
import {
  compendiumCategorySchema,
  compendiumContentSchema,
  compendiumEntrySchema,
} from "./compendium.js";
import {
  actSchema,
  chapterSchema,
  projectSchema,
  projectSettingsSchema,
  sceneMetadataSchema,
  sceneSchema,
  tiptapDocumentSchema,
} from "./manuscript.js";
import { projectNoteSchema } from "./notes.js";
import { ingredientPackValuesSchema } from "./packages.js";
import { idSchema, timestampSchema } from "./primitives.js";

export const archiveAssetReferenceSchema = z.object({
  path: z.string().regex(/^assets\/[A-Za-z0-9._/-]+$/),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("cover") }),
    z.object({ kind: z.literal("compendium"), entryId: idSchema }),
  ]),
});

export const sceneRevisionArchiveSchema = z.object({
  id: idSchema,
  sceneId: idSchema,
  version: z.number().int().positive(),
  document: tiptapDocumentSchema,
  plainText: z.string(),
  reason: z.enum(["autosave", "manual", "generation_accept", "restore"]),
  createdAt: timestampSchema,
});

export const projectArchiveV5Schema = z.object({
  schemaVersion: z.literal(5),
  project: projectSchema,
  manuscript: z.array(
    actSchema.extend({
      chapters: z.array(
        chapterSchema.extend({
          scenes: z.array(sceneSchema.extend({ revisions: z.array(sceneRevisionArchiveSchema) })),
        }),
      ),
    }),
  ),
  compendiumCategories: z.array(compendiumCategorySchema),
  compendium: z.array(compendiumEntrySchema.extend({ singletonKey: z.string().nullable() })),
  notes: z.array(projectNoteSchema),
  projectIngredientPacks: z.array(
    z.object({
      sourcePackId: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      ownership: z.enum(["builtin", "user"]),
      values: ingredientPackValuesSchema,
      importedAt: timestampSchema,
    }),
  ),
  chatThreads: z.array(
    chatThreadSchema.extend({
      summarizedThroughMessageId: idSchema.nullable(),
      messages: z.array(
        chatMessageSchema.extend({
          inputTokens: z.number().int().nonnegative().nullable(),
          outputTokens: z.number().int().nonnegative().nullable(),
        }),
      ),
    }),
  ),
  assets: z.array(archiveAssetReferenceSchema),
});

export const legacyProjectArchiveV4Schema = z.object({
  schemaVersion: z.literal(4),
  project: z.object({
    title: z.string().trim().min(1).max(300),
    settings: projectSettingsSchema.partial().optional(),
  }),
  manuscript: z.array(
    z.object({
      title: z.string().default(""),
      position: z.number().int().nonnegative(),
      chapters: z.array(
        z.object({
          title: z.string().default(""),
          position: z.number().int().nonnegative(),
          scenes: z.array(
            z.object({
              title: z.string().default(""),
              position: z.number().int().nonnegative(),
              document: tiptapDocumentSchema,
              plainText: z.string(),
              version: z.number().int().positive().default(1),
              metadata: sceneMetadataSchema,
            }),
          ),
        }),
      ),
    }),
  ),
  compendium: z.array(
    z.object({
      id: idSchema.optional(),
      name: z.string().trim().min(1).max(300),
      typeId: z.string(),
      aliases: z.array(z.string()).default([]),
      labels: z.array(z.string()).default([]),
      imageDataUrl: z.string().nullable().optional(),
      trackingEnabled: z.boolean().default(true),
      matchExclusions: z.array(z.string()).default([]),
      activationMode: z.enum(["mention", "always", "never", "smart"]).default("mention"),
      caseSensitive: z.boolean().default(false),
      content: compendiumContentSchema,
      singletonKey: z.string().nullable().optional(),
    }),
  ),
  compendiumCategories: z
    .array(
      z.object({
        id: idSchema,
        name: z.string(),
        position: z.number().int().nonnegative().default(0),
      }),
    )
    .default([]),
  notes: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        document: tiptapDocumentSchema,
        plainText: z.string().max(500_000),
        pinned: z.boolean().default(false),
        version: z.number().int().positive().default(1),
      }),
    )
    .default([]),
  projectTagPacks: z
    .array(
      z.object({
        sourcePackId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().default(""),
        ownership: z.enum(["builtin", "user"]),
        values: ingredientPackValuesSchema,
      }),
    )
    .default([]),
});

export type ProjectArchiveV5 = z.infer<typeof projectArchiveV5Schema>;
export type LegacyProjectArchiveV4 = z.infer<typeof legacyProjectArchiveV4Schema>;
