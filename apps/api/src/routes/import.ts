import type { CompendiumContent, SceneMetadata, TiptapNode } from "@asterism/contracts";
import { acts, chapters, compendiumEntries, projectNotes, projects, scenes } from "@asterism/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { parseWith } from "../http.js";
import { ownedWorkspaceId } from "../ownership.js";

const importSchema = z.object({
  schemaVersion: z.number(),
  project: z.object({
    title: z.string(),
    settings: z.object({ notes: z.string().optional() }).optional(),
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
});

export async function registerImportRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post("/api/projects/import", async (request, reply) => {
    const input = parseWith(importSchema, request.body);
    const workspaceId = await ownedWorkspaceId(context, request.userId);

    const result = await context.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ workspaceId, title: input.project.title })
        .returning();

      if (!project) throw new Error("Project creation failed.");

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
                metadata: sceneData.metadata as SceneMetadata,
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
            projectId: project.id,
            name: entry.name,
            typeId: entry.typeId,
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
      } else if (input.project.settings?.notes?.trim()) {
        const legacyNotes = input.project.settings.notes.trim();
        await tx.insert(projectNotes).values({
          projectId: project.id,
          title: "Project Notes",
          document: {
            type: "doc",
            content: legacyNotes.split(/\r?\n/).map((line) => ({
              type: "paragraph",
              ...(line ? { content: [{ type: "text", text: line }] } : {}),
            })),
          },
          plainText: legacyNotes,
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
