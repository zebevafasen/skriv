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
  definitionId: z.string().min(1).max(120).nullable().default(null),
  text: z.string().trim().min(1).max(60),
  color: sceneLabelColorSchema,
});

export const sceneLabelDefinitionSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(60),
  color: sceneLabelColorSchema,
});

export const sceneLabelPackSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(300).default(""),
  ownership: z.enum(["builtin", "user"]),
  protected: z.boolean().default(false),
  selectionMode: z.literal("single").default("single"),
  labels: z.array(sceneLabelDefinitionSchema).max(100).default([]),
});

export const defaultUserLabelPack = sceneLabelPackSchema.parse({
  id: "user.default",
  name: "My Labels",
  description: "Quick labels created for this project.",
  ownership: "user",
  protected: true,
  selectionMode: "single",
  labels: [],
});

const sceneMetadataBaseSchema = z.object({
  summary: z.string().max(20_000).default(""),
  povEntryId: idSchema.nullable().default(null),
  locationEntryId: idSchema.nullable().default(null),
  presentCharacterEntryIds: z.array(idSchema).default([]),
  goal: z.string().max(10_000).default(""),
  notes: z.string().max(50_000).default(""),
  status: sceneStatusSchema.default("draft"),
  manualCompendiumEntryIds: z.array(idSchema).max(250).default([]),
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

const projectSettingsValueShape = {
  author: z.string().max(100),
  series: z.string().max(100),
  seriesIndex: z.string().max(50),
  coverDataUrl: z.string().nullable(),
  coverArtworkSeed: z.string().max(300).optional(),
  tense: z.enum(["Past", "Present"]),
  language: storyLanguageSchema,
  povType: z.enum([
    "1st Person",
    "2nd Person",
    "3rd Person",
    "3rd Person (Limited)",
    "3rd Person (Omniscient)",
  ]),
  povCharacterEntryId: idSchema.nullable(),
  notes: z.string().max(500_000),
  labelPacks: z.array(sceneLabelPackSchema).max(50),
};

export const projectSettingsSchema = z.object({
  ...projectSettingsValueShape,
  author: projectSettingsValueShape.author.default(""),
  series: projectSettingsValueShape.series.default(""),
  seriesIndex: projectSettingsValueShape.seriesIndex.default(""),
  coverDataUrl: projectSettingsValueShape.coverDataUrl.default(null),
  tense: projectSettingsValueShape.tense.default("Past"),
  language: projectSettingsValueShape.language.default("General English"),
  povType: projectSettingsValueShape.povType.default("3rd Person (Limited)"),
  povCharacterEntryId: projectSettingsValueShape.povCharacterEntryId.default(null),
  notes: projectSettingsValueShape.notes.default(""),
  labelPacks: projectSettingsValueShape.labelPacks.default([defaultUserLabelPack]),
});

export const projectSchema = z.object({
  id: idSchema,
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

export const createProjectInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    author: z.string().max(100).default(""),
    language: storyLanguageSchema.default("General English"),
    ingredientPackIds: z.array(z.string().min(1)).max(250).default([]),
    outline: outlineSourceSchema.default({ kind: "blank" }),
    compendiumCopy: z
      .object({ sourceProjectId: idSchema, entryIds: z.array(idSchema).max(1_000) })
      .nullable()
      .default(null),
  })
  .strict();

export const updateProjectInputSchema = z.object({
  title: z.string().trim().max(300).optional(),
  settings: z.object(projectSettingsValueShape).partial().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
type ProjectSettingsUpdate = NonNullable<UpdateProjectInput["settings"]>;

const coverOnlySettings = new Set<keyof ProjectSettingsUpdate>([
  "coverDataUrl",
  "coverArtworkSeed",
]);

export function projectUpdateTouchesModifiedAt(input: UpdateProjectInput): boolean {
  if (input.title !== undefined) return true;
  return Object.keys(input.settings ?? {}).some(
    (key) => !coverOnlySettings.has(key as keyof ProjectSettingsUpdate),
  );
}

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
export type SceneLabelDefinition = z.infer<typeof sceneLabelDefinitionSchema>;
export type SceneLabelPack = z.infer<typeof sceneLabelPackSchema>;
export type ManuscriptTree = z.infer<typeof manuscriptTreeSchema>;
export type CreateManuscriptItemInput = z.infer<typeof createManuscriptItemInputSchema>;
export type CreateManuscriptItemResponse = z.infer<typeof createManuscriptItemResponseSchema>;
