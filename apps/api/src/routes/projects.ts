import {
  actSchema,
  type CompendiumContent,
  chapterSchema,
  createActInputSchema,
  createChapterInputSchema,
  createProjectInputSchema,
  createSceneInputSchema,
  emptyTiptapDocument,
  projectSettingsSchema,
  reorderInputSchema,
  sceneMetadataSchema,
  updateProjectInputSchema,
  updateSceneInputSchema,
} from "@asterism/contracts";
import {
  acts,
  chapters,
  compendiumEntries,
  projects,
  sceneRevisions,
  scenes,
  touchUpdatedAt,
  workspaceMembers,
} from "@asterism/db";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownedAct, ownedChapter, ownedScene, ownedWorkspaceId, ownsProject } from "../ownership.js";

const idParams = z.object({ id: z.uuid() });
const childParams = z.object({ id: z.uuid(), childId: z.uuid().optional() });
const renameInputSchema = z.object({ title: z.string().trim().max(300) });

const defaultSceneMetadata = sceneMetadataSchema.parse({});

const singletonEntries: Array<{
  key: string;
  name: string;
  typeId:
    | "project.premise"
    | "project.genres"
    | "project.themes"
    | "project.tags"
    | "project.instructions";
  content: CompendiumContent;
}> = [
  {
    key: "premise",
    name: "Premise",
    typeId: "project.premise",
    content: { kind: "text", text: "" },
  },
  {
    key: "genres",
    name: "Genres",
    typeId: "project.genres",
    content: { kind: "selection", values: [] },
  },
  {
    key: "themes",
    name: "Themes",
    typeId: "project.themes",
    content: { kind: "selection", values: [] },
  },
  { key: "tags", name: "Tags", typeId: "project.tags", content: { kind: "selection", values: [] } },
  {
    key: "instructions",
    name: "Project Instructions",
    typeId: "project.instructions",
    content: { kind: "text", text: "" },
  },
];

function timestamp(value: Date): string {
  return value.toISOString();
}

function sceneResponse(scene: typeof scenes.$inferSelect) {
  return { ...scene, createdAt: timestamp(scene.createdAt), updatedAt: timestamp(scene.updatedAt) };
}

async function nextPosition(
  context: AppContext,
  table: typeof acts | typeof chapters | typeof scenes,
  parentColumn: unknown,
  parentId: string,
) {
  const positionColumn =
    table === acts ? acts.position : table === chapters ? chapters.position : scenes.position;
  const [row] = await context.db
    .select({ value: max(positionColumn) })
    .from(table as typeof acts)
    .where(eq(parentColumn as typeof acts.projectId, parentId));
  return (row?.value ?? -1) + 1;
}

export async function registerProjectRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/projects", async (request) => {
    const rows = await context.db
      .select({ project: projects })
      .from(projects)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
      .where(eq(workspaceMembers.userId, request.userId))
      .orderBy(desc(projects.updatedAt));
    return rows.map(({ project }) => ({
      ...project,
      createdAt: timestamp(project.createdAt),
      updatedAt: timestamp(project.updatedAt),
    }));
  });

  app.post("/api/projects", async (request, reply) => {
    const input = parseWith(createProjectInputSchema, request.body);
    const workspaceId = await ownedWorkspaceId(context, request.userId);
    const result = await context.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ workspaceId, title: input.title, settings: projectSettingsSchema.parse({}) })
        .returning();
      if (!project) throw new Error("Project creation failed.");
      const [act] = await tx
        .insert(acts)
        .values({ projectId: project.id, title: "Act I", position: 0 })
        .returning();
      if (!act) throw new Error("Act creation failed.");
      const [chapter] = await tx
        .insert(chapters)
        .values({ actId: act.id, title: "Chapter 1", position: 0 })
        .returning();
      if (!chapter) throw new Error("Chapter creation failed.");
      const [scene] = await tx
        .insert(scenes)
        .values({
          chapterId: chapter.id,
          title: "Opening Scene",
          position: 0,
          document: emptyTiptapDocument,
          plainText: "",
          metadata: defaultSceneMetadata,
        })
        .returning();
      if (!scene) throw new Error("Scene creation failed.");
      await tx.insert(compendiumEntries).values(
        singletonEntries.map((entry) => ({
          projectId: project.id,
          name: entry.name,
          typeId: entry.typeId,
          activationMode: "always" as const,
          content: entry.content,
          singletonKey: entry.key,
        })),
      );
      return { project, act, chapter, scene };
    });
    return reply.code(201).send({
      project: {
        ...result.project,
        createdAt: timestamp(result.project.createdAt),
        updatedAt: timestamp(result.project.updatedAt),
      },
      initialSceneId: result.scene.id,
    });
  });

  app.get("/api/projects/:id/tree", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const [project] = await context.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound(reply, "Project not found.");
    const actRows = await context.db
      .select()
      .from(acts)
      .where(eq(acts.projectId, id))
      .orderBy(asc(acts.position));
    const chapterRows = actRows.length
      ? await context.db
          .select()
          .from(chapters)
          .where(
            inArray(
              chapters.actId,
              actRows.map((act) => act.id),
            ),
          )
          .orderBy(asc(chapters.position))
      : [];
    const sceneRows = chapterRows.length
      ? await context.db
          .select()
          .from(scenes)
          .where(
            inArray(
              scenes.chapterId,
              chapterRows.map((chapter) => chapter.id),
            ),
          )
          .orderBy(asc(scenes.position))
      : [];
    return {
      project: {
        ...project,
        createdAt: timestamp(project.createdAt),
        updatedAt: timestamp(project.updatedAt),
      },
      acts: actRows.map((act) => ({
        id: act.id,
        projectId: act.projectId,
        title: act.title,
        position: act.position,
        chapters: chapterRows
          .filter((chapter) => chapter.actId === act.id)
          .map((chapter) => ({
            id: chapter.id,
            actId: chapter.actId,
            title: chapter.title,
            position: chapter.position,
            scenes: sceneRows.filter((scene) => scene.chapterId === chapter.id).map(sceneResponse),
          })),
      })),
    };
  });

  app.post("/api/projects/:id/acts", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const input = parseWith(createActInputSchema, request.body ?? {});
    const position = await nextPosition(context, acts, acts.projectId, id);
    const [act] = await context.db
      .insert(acts)
      .values({ projectId: id, title: input.title, position })
      .returning();
    return reply.code(201).send(actSchema.parse(act));
  });

  app.post("/api/acts/:id/chapters", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const [owned] = await context.db
      .select({ projectId: projects.id })
      .from(acts)
      .innerJoin(projects, eq(projects.id, acts.projectId))
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
      .where(and(eq(acts.id, id), eq(workspaceMembers.userId, request.userId)))
      .limit(1);
    if (!owned) return notFound(reply, "Act not found.");
    const input = parseWith(createChapterInputSchema, request.body ?? {});
    const position = await nextPosition(context, chapters, chapters.actId, id);
    const [chapter] = await context.db
      .insert(chapters)
      .values({ actId: id, title: input.title, position })
      .returning();
    return reply.code(201).send(chapterSchema.parse(chapter));
  });

  app.post("/api/chapters/:id/scenes", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const [owned] = await context.db
      .select({ projectId: projects.id })
      .from(chapters)
      .innerJoin(acts, eq(acts.id, chapters.actId))
      .innerJoin(projects, eq(projects.id, acts.projectId))
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
      .where(and(eq(chapters.id, id), eq(workspaceMembers.userId, request.userId)))
      .limit(1);
    if (!owned) return notFound(reply, "Chapter not found.");
    const input = parseWith(createSceneInputSchema, request.body ?? {});
    const position = await nextPosition(context, scenes, scenes.chapterId, id);
    const [scene] = await context.db
      .insert(scenes)
      .values({
        chapterId: id,
        title: input.title,
        position,
        document: emptyTiptapDocument,
        plainText: "",
        metadata: defaultSceneMetadata,
      })
      .returning();
    if (!scene) throw new Error("Scene creation failed.");
    return reply.code(201).send(sceneResponse(scene));
  });

  app.get("/api/scenes/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const owned = await ownedScene(context, request.userId, id);
    if (!owned) return notFound(reply, "Scene not found.");
    return sceneResponse(owned.scene);
  });

  app.patch("/api/scenes/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const input = parseWith(updateSceneInputSchema, request.body);
    const owned = await ownedScene(context, request.userId, id);
    if (!owned) return notFound(reply, "Scene not found.");
    if (owned.scene.version !== input.expectedVersion) {
      return conflict(reply, "Scene changed since it was loaded.", {
        currentVersion: owned.scene.version,
      });
    }
    const updated = await context.db.transaction(async (tx) => {
      if (input.document && input.plainText !== undefined) {
        await tx.insert(sceneRevisions).values({
          sceneId: id,
          version: owned.scene.version,
          document: owned.scene.document,
          plainText: owned.scene.plainText,
          reason: input.revisionReason,
          createdBy: request.userId,
        });
      }
      const [scene] = await tx
        .update(scenes)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.document !== undefined ? { document: input.document } : {}),
          ...(input.plainText !== undefined ? { plainText: input.plainText } : {}),
          ...(input.metadata !== undefined
            ? {
                metadata: {
                  ...owned.scene.metadata,
                  ...Object.fromEntries(
                    Object.entries(input.metadata).filter(([, value]) => value !== undefined),
                  ),
                } as typeof owned.scene.metadata,
              }
            : {}),
          version: owned.scene.version + 1,
          ...touchUpdatedAt,
        })
        .where(and(eq(scenes.id, id), eq(scenes.version, input.expectedVersion)))
        .returning();
      return scene;
    });
    if (!updated) return conflict(reply, "Scene changed while it was being saved.");
    return sceneResponse(updated);
  });

  app.get("/api/scenes/:id/revisions", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedScene(context, request.userId, id)))
      return notFound(reply, "Scene not found.");
    const rows = await context.db
      .select()
      .from(sceneRevisions)
      .where(eq(sceneRevisions.sceneId, id))
      .orderBy(desc(sceneRevisions.createdAt))
      .limit(100);
    return rows.map((row) => ({ ...row, createdAt: timestamp(row.createdAt) }));
  });

  app.post("/api/scenes/:id/revisions/:childId/restore", async (request, reply) => {
    const { id, childId } = parseWith(childParams.required({ childId: true }), request.params);
    const owned = await ownedScene(context, request.userId, id);
    if (!owned) return notFound(reply, "Scene not found.");
    const [revision] = await context.db
      .select()
      .from(sceneRevisions)
      .where(and(eq(sceneRevisions.id, childId), eq(sceneRevisions.sceneId, id)))
      .limit(1);
    if (!revision) return notFound(reply, "Revision not found.");
    const restored = await context.db.transaction(async (tx) => {
      await tx.insert(sceneRevisions).values({
        sceneId: id,
        version: owned.scene.version,
        document: owned.scene.document,
        plainText: owned.scene.plainText,
        reason: "restore",
        createdBy: request.userId,
      });
      const [next] = await tx
        .update(scenes)
        .set({
          document: revision.document,
          plainText: revision.plainText,
          version: owned.scene.version + 1,
          ...touchUpdatedAt,
        })
        .where(and(eq(scenes.id, id), eq(scenes.version, owned.scene.version)))
        .returning();
      return next;
    });
    if (!restored) return conflict(reply, "Scene changed while the revision was restored.");
    return sceneResponse(restored);
  });

  app.post("/api/projects/:id/acts/reorder", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const { orderedIds } = parseWith(reorderInputSchema, request.body);
    const rows = await context.db.select({ id: acts.id }).from(acts).where(eq(acts.projectId, id));
    if (rows.length !== orderedIds.length || rows.some((row) => !orderedIds.includes(row.id))) {
      return conflict(reply, "Reorder list must contain every Act exactly once.");
    }
    await context.db.transaction(async (tx) => {
      await Promise.all(
        orderedIds.map((actId, position) =>
          tx
            .update(acts)
            .set({ position, ...touchUpdatedAt })
            .where(eq(acts.id, actId)),
        ),
      );
    });
    return reply.code(204).send();
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const input = parseWith(updateProjectInputSchema, request.body);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    
    const [current] = await context.db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, id)).limit(1);
    if (!current) return notFound(reply, "Project not found.");

    const [project] = await context.db
      .update(projects)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.settings !== undefined ? { settings: { ...current.settings, ...input.settings } } : {}),
        ...touchUpdatedAt 
      })
      .where(eq(projects.id, id))
      .returning();
    return project;
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    await context.db.delete(projects).where(eq(projects.id, id));
    return reply.code(204).send();
  });

  app.patch("/api/acts/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const { title } = parseWith(renameInputSchema, request.body);
    if (!(await ownedAct(context, request.userId, id))) return notFound(reply, "Act not found.");
    const [act] = await context.db
      .update(acts)
      .set({ title, ...touchUpdatedAt })
      .where(eq(acts.id, id))
      .returning();
    return act;
  });

  app.delete("/api/acts/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedAct(context, request.userId, id))) return notFound(reply, "Act not found.");
    await context.db.delete(acts).where(eq(acts.id, id));
    return reply.code(204).send();
  });

  app.patch("/api/chapters/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const { title } = parseWith(renameInputSchema, request.body);
    if (!(await ownedChapter(context, request.userId, id)))
      return notFound(reply, "Chapter not found.");
    const [chapter] = await context.db
      .update(chapters)
      .set({ title, ...touchUpdatedAt })
      .where(eq(chapters.id, id))
      .returning();
    return chapter;
  });

  app.delete("/api/chapters/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedChapter(context, request.userId, id)))
      return notFound(reply, "Chapter not found.");
    await context.db.delete(chapters).where(eq(chapters.id, id));
    return reply.code(204).send();
  });

  app.delete("/api/scenes/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedScene(context, request.userId, id)))
      return notFound(reply, "Scene not found.");
    await context.db.delete(scenes).where(eq(scenes.id, id));
    return reply.code(204).send();
  });

  app.post("/api/acts/:id/chapters/reorder", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedAct(context, request.userId, id))) return notFound(reply, "Act not found.");
    const { orderedIds } = parseWith(reorderInputSchema, request.body);
    const rows = await context.db
      .select({ id: chapters.id })
      .from(chapters)
      .where(eq(chapters.actId, id));
    if (rows.length !== orderedIds.length || rows.some((row) => !orderedIds.includes(row.id))) {
      return conflict(reply, "Reorder list must contain every Chapter exactly once.");
    }
    await context.db.transaction(async (tx) => {
      await Promise.all(
        orderedIds.map((chapterId, position) =>
          tx
            .update(chapters)
            .set({ position, ...touchUpdatedAt })
            .where(eq(chapters.id, chapterId)),
        ),
      );
    });
    return reply.code(204).send();
  });

  app.post("/api/chapters/:id/scenes/reorder", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedChapter(context, request.userId, id)))
      return notFound(reply, "Chapter not found.");
    const { orderedIds } = parseWith(reorderInputSchema, request.body);
    const rows = await context.db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.chapterId, id));
    if (rows.length !== orderedIds.length || rows.some((row) => !orderedIds.includes(row.id))) {
      return conflict(reply, "Reorder list must contain every Scene exactly once.");
    }
    await context.db.transaction(async (tx) => {
      await Promise.all(
        orderedIds.map((sceneId, position) =>
          tx
            .update(scenes)
            .set({ position, ...touchUpdatedAt })
            .where(eq(scenes.id, sceneId)),
        ),
      );
    });
    return reply.code(204).send();
  });
}
