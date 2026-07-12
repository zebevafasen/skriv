import { z } from "zod";
import { idSchema, timestampSchema } from "./primitives.js";
import { outlineSourceSchema, storyLanguageSchema } from "./setup.js";

export type TiptapNode = {
  type?: string | undefined;
  attrs?: Record<string, unknown> | undefined;
  content?: TiptapNode[] | undefined;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> | undefined }> | undefined;
  text?: string | undefined;
};

export const tiptapDocumentSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(tiptapDocumentSchema).optional(),
    marks: z
      .array(z.object({ type: z.string(), attrs: z.record(z.string(), z.unknown()).optional() }))
      .optional(),
    text: z.string().optional(),
  }),
);

export const emptyTiptapDocument: TiptapNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const sceneStatusSchema = z.enum(["draft", "revising", "complete"]);

export const sceneLabelColorSchema = z.enum([
  "amber",
  "orange",
  "red",
  "rose",
  "pink",
  "violet",
  "purple",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "stone",
  "slate",
]);

export const sceneLabelSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(60),
  color: sceneLabelColorSchema,
});

const sceneMetadataBaseSchema = z.object({
  summary: z.string().max(20_000).default(""),
  povEntryId: idSchema.nullable().default(null),
  locationEntryId: idSchema.nullable().default(null),
  presentCharacterEntryIds: z.array(idSchema).default([]),
  goal: z.string().max(10_000).default(""),
  notes: z.string().max(50_000).default(""),
  status: sceneStatusSchema.default("draft"),
  labels: z.array(sceneLabelSchema).max(24).default([]),
});

export const sceneMetadataSchema = sceneMetadataBaseSchema.superRefine((metadata, context) => {
  const labels = new Set<string>();
  metadata.labels.forEach((label, index) => {
    const normalized = label.text.toLocaleLowerCase();
    if (labels.has(normalized)) {
      context.addIssue({
        code: "custom",
        path: ["labels", index, "text"],
        message: "Scene labels must be unique, ignoring capitalization.",
      });
    }
    labels.add(normalized);
  });
});

export const projectSettingsSchema = z.object({
  author: z.string().max(100).default(""),
  series: z.string().max(100).default(""),
  seriesIndex: z.string().max(50).default(""),
  coverDataUrl: z.string().nullable().default(null),
  tense: z.enum(["Past", "Present"]).default("Past"),
  language: storyLanguageSchema.default("General English"),
  povType: z
    .enum([
      "1st Person",
      "2nd Person",
      "3rd Person",
      "3rd Person (Limited)",
      "3rd Person (Omniscient)",
    ])
    .default("3rd Person (Limited)"),
  povCharacterEntryId: idSchema.nullable().default(null),
  notes: z.string().max(500_000).default(""),
});

export const projectSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  title: z.string().min(1).max(300),
  settings: projectSettingsSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const actSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string().max(300),
  position: z.number().int().nonnegative(),
});

export const chapterSchema = z.object({
  id: idSchema,
  actId: idSchema,
  title: z.string().max(300),
  position: z.number().int().nonnegative(),
});

export const sceneSchema = z.object({
  id: idSchema,
  chapterId: idSchema,
  title: z.string().max(300),
  position: z.number().int().nonnegative(),
  document: tiptapDocumentSchema,
  plainText: z.string(),
  version: z.number().int().positive(),
  metadata: sceneMetadataSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const manuscriptTreeSchema = z.object({
  project: projectSchema,
  acts: z.array(
    actSchema.extend({
      chapters: z.array(chapterSchema.extend({ scenes: z.array(sceneSchema) })),
    }),
  ),
});

export const createProjectInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().max(100).default(""),
  language: storyLanguageSchema.default("General English"),
  tagPackIds: z.array(z.string().min(1)).max(50).default([]),
  outline: outlineSourceSchema.default({ kind: "blank" }),
  compendiumCopy: z
    .object({ sourceProjectId: idSchema, entryIds: z.array(idSchema).max(1_000) })
    .nullable()
    .default(null),
});

export const updateProjectInputSchema = z.object({
  title: z.string().trim().max(300).optional(),
  settings: projectSettingsSchema.partial().optional(),
});

export const createActInputSchema = z.object({
  title: z.string().trim().max(300).default(""),
});
export const createChapterInputSchema = z.object({
  title: z.string().trim().max(300).default(""),
});
export const createSceneInputSchema = z.object({
  title: z.string().trim().max(300).default(""),
});

export const updateSceneInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().max(300).optional(),
  document: tiptapDocumentSchema.optional(),
  plainText: z.string().max(2_000_000).optional(),
  metadata: sceneMetadataBaseSchema.partial().optional(),
  revisionReason: z.enum(["autosave", "manual", "generation_accept"]).default("autosave"),
});

export const reorderInputSchema = z.object({ orderedIds: z.array(idSchema).min(1) });

export const createManuscriptItemInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("act"), afterActId: idSchema.nullable().default(null) }),
  z.object({
    kind: z.literal("chapter"),
    actId: idSchema,
    afterChapterId: idSchema.nullable().default(null),
  }),
  z.object({
    kind: z.literal("scene"),
    chapterId: idSchema,
    afterSceneId: idSchema.nullable().default(null),
  }),
]);

export const createManuscriptItemResponseSchema = z.object({
  kind: z.enum(["act", "chapter", "scene"]),
  createdActId: idSchema.nullable(),
  createdChapterId: idSchema.nullable(),
  createdSceneId: idSchema,
  initialSceneId: idSchema,
});

export const generateSceneSummaryInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  modelOverride: z.string().min(1).nullable().optional(),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneMetadata = z.infer<typeof sceneMetadataSchema>;
export type SceneLabel = z.infer<typeof sceneLabelSchema>;
export type SceneLabelColor = z.infer<typeof sceneLabelColorSchema>;
export type ManuscriptTree = z.infer<typeof manuscriptTreeSchema>;
export type CreateManuscriptItemInput = z.infer<typeof createManuscriptItemInputSchema>;
export type CreateManuscriptItemResponse = z.infer<typeof createManuscriptItemResponseSchema>;
