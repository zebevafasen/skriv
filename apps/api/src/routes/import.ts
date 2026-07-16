import {
  type CompendiumContent,
  projectSettingsSchema,
  type SceneMetadata,
  type TiptapNode,
  ingredientPackValuesSchema,
} from "@skriv/contracts";
import {
  acts,
  chapters,
  compendiumCategories,
  compendiumEntries,
  projectNotes,
  projects,
  projectIngredientPacks,
  scenes,
} from "@skriv/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { parseWith } from "../http.js";
import { ownedWorkspaceId } from "../ownership.js";

const importSchema = z.object({
  schemaVersion: z.number(),
  project: z.object({
    title: z.string(),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
  manuscript: z.array(
    z.object({
      title: z.string(),
      position: z.number(),
      chapters: z.array(
        z.object({
          title: z.string(),
          position: z.number(),
          scenes: z.array(
            z.object({
              title: z.string(),
              position: z.number(),
              document: z.any(),
              plainText: z.string(),
              version: z.number().optional(),
              metadata: z.any(),
            }),
          ),
        }),
      ),
    }),
  ),
  compendium: z.array(
    z.object({
      id: z.uuid().optional(),
      name: z.string(),
      typeId: z.string(),
      aliases: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional(),
      imageDataUrl: z.string().nullable().optional(),
      trackingEnabled: z.boolean().optional(),
      matchExclusions: z.array(z.string()).optional(),
      activationMode: z.enum(["mention", "always", "never", "smart"]).optional(),
      caseSensitive: z.boolean().optional(),
      content: z.any(),
      singletonKey: z.string().nullable().optional(),
    }),
  ),
  compendiumCategories: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(120),
        position: z.number().int().nonnegative().optional(),
      }),
    )
    .optional()
    .default([]),
  notes: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        document: z.any(),
        plainText: z.string().max(500_000),
        pinned: z.boolean().optional(),
        version: z.number().int().positive().optional(),
      }),
    )
    .optional()
    .default([]),
  // Export schema v4 keeps this legacy key for backward-compatible archives.
  projectTagPacks: z
    .array(
      z.object({
        sourcePackId: z.string().min(1),
        name: z.string().trim().min(1).max(120),
        description: z.string().max(1_000).optional().default(""),
        ownership: z.enum(["builtin", "user"]),
        values: ingredientPackValuesSchema,
      }),
    )
    .optional()
    .default([]),
});

export async function registerImportRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post("/api/projects/import", { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const input = parseWith(importSchema, request.body);
    const workspaceId = await ownedWorkspaceId(context, request.userId);

    const result = await context.db.transaction(async (tx) => {
      const entryIdMap = new Map(
        input.compendium.flatMap((entry) =>
          entry.id ? [[entry.id, crypto.randomUUID()] as const] : [],
        ),
      );
      const categoryIdMap = new Map(
        input.compendiumCategories.map((category) => [category.id, crypto.randomUUID()] as const),
      );
      const parsedSettings = projectSettingsSchema.parse(input.project.settings ?? {});
      const settings = {
        ...parsedSettings,
        povCharacterEntryId: parsedSettings.povCharacterEntryId
          ? (entryIdMap.get(parsedSettings.povCharacterEntryId) ?? null)
          : null,
      };
      const [project] = await tx
        .insert(projects)
        .values({ workspaceId, title: input.project.title, settings })
        .returning();

      if (!project) throw new Error("Project creation failed.");

      if (input.compendiumCategories.length) {
        await tx.insert(compendiumCategories).values(
          input.compendiumCategories.map((category) => ({
            id: categoryIdMap.get(category.id),
            projectId: project.id,
            name: category.name,
            normalizedName: category.name.normalize("NFKC").toLocaleLowerCase(),
            position: category.position ?? 0,
          })),
        );
      }

      if (input.projectTagPacks.length) {
        await tx.insert(projectIngredientPacks).values(
          input.projectTagPacks.map((pack) => ({
            projectId: project.id,
            sourcePackId: pack.sourcePackId,
            name: pack.name,
            description: pack.description,
            ownership: pack.ownership,
            values: pack.values,
          })),
        );
      }

      let initialSceneId: string | null = null;

      for (const actData of input.manuscript) {
        const [act] = await tx
          .insert(acts)
          .values({
            projectId: project.id,
            title: actData.title,
            position: actData.position,
          })
          .returning();

        if (!act) throw new Error("Act creation failed.");

        for (const chapterData of actData.chapters) {
          const [chapter] = await tx
            .insert(chapters)
            .values({
              actId: act.id,
              title: chapterData.title,
              position: chapterData.position,
            })
            .returning();

          if (!chapter) throw new Error("Chapter creation failed.");

          for (const sceneData of chapterData.scenes) {
            const [scene] = await tx
              .insert(scenes)
              .values({
                chapterId: chapter.id,
                title: sceneData.title,
                position: sceneData.position,
                document: sceneData.document as TiptapNode,
                plainText: sceneData.plainText,
                version: sceneData.version ?? 1,
                metadata: (() => {
                  const metadata = sceneData.metadata as SceneMetadata;
                  return {
                    ...metadata,
                    povEntryId: metadata.povEntryId
                      ? (entryIdMap.get(metadata.povEntryId) ?? null)
                      : null,
                    locationEntryId: metadata.locationEntryId
                      ? (entryIdMap.get(metadata.locationEntryId) ?? null)
                      : null,
                    presentCharacterEntryIds: (metadata.presentCharacterEntryIds ?? []).flatMap(
                      (id) => {
                        const mapped = entryIdMap.get(id);
                        return mapped ? [mapped] : [];
                      },
                    ),
                    manualCompendiumEntryIds: (metadata.manualCompendiumEntryIds ?? []).flatMap(
                      (id) => {
                        const mapped = entryIdMap.get(id);
                        return mapped ? [mapped] : [];
                      },
                    ),
                  };
                })(),
              })
              .returning();

            if (!scene) throw new Error("Scene creation failed.");

            if (!initialSceneId) {
              initialSceneId = scene.id;
            }
          }
        }
      }

      if (input.compendium.length > 0) {
        await tx.insert(compendiumEntries).values(
          input.compendium.map((entry) => ({
            ...(entry.id && entryIdMap.get(entry.id) ? { id: entryIdMap.get(entry.id) } : {}),
            projectId: project.id,
            name: entry.name,
            typeId: entry.typeId.startsWith("custom.")
              ? `custom.${categoryIdMap.get(entry.typeId.slice(7)) ?? entry.typeId.slice(7)}`
              : entry.typeId,
            aliases: entry.aliases ?? [],
            labels: entry.labels ?? [],
            imageDataUrl: entry.imageDataUrl,
            trackingEnabled: entry.trackingEnabled ?? true,
            matchExclusions: entry.matchExclusions ?? [],
            activationMode: entry.activationMode ?? "mention",
            caseSensitive: entry.caseSensitive ?? false,
            content: entry.content as CompendiumContent,
            singletonKey: entry.singletonKey,
          })),
        );
      }

      if (input.notes.length > 0) {
        await tx.insert(projectNotes).values(
          input.notes.map((note) => ({
            projectId: project.id,
            title: note.title,
            document: note.document as TiptapNode,
            plainText: note.plainText,
            pinned: note.pinned ?? false,
            version: note.version ?? 1,
          })),
        );
      } else if (
        typeof input.project.settings?.notes === "string" &&
        input.project.settings.notes.trim()
      ) {
        const archivedNotes = input.project.settings.notes.trim();
        await tx.insert(projectNotes).values({
          projectId: project.id,
          title: "Project Notes",
          document: {
            type: "doc",
            content: archivedNotes.split(/\r?\n/).map((line) => ({
              type: "paragraph",
              ...(line ? { content: [{ type: "text", text: line }] } : {}),
            })),
          },
          plainText: archivedNotes,
          pinned: true,
        });
      }

      return { project, initialSceneId };
    });

    return reply.code(201).send({
      project: {
        ...result.project,
        createdAt: result.project.createdAt.toISOString(),
        updatedAt: result.project.updatedAt.toISOString(),
      },
      initialSceneId: result.initialSceneId,
    });
  });
}
