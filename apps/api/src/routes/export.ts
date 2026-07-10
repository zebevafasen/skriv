import { acts, chapters, compendiumEntries, projects, scenes } from "@asterism/db";
import { asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const paramsSchema = z.object({ id: z.uuid() });

export async function registerExportRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/projects/:id/export", async (request, reply) => {
    const { id } = parseWith(paramsSchema, request.params);
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
              actRows.map((row) => row.id),
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
              chapterRows.map((row) => row.id),
            ),
          )
          .orderBy(asc(scenes.position))
      : [];
    const entries = await context.db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.projectId, id));
    reply.header("Content-Disposition", `attachment; filename="asterism-${id}.json"`);
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project,
      manuscript: actRows.map((act) => ({
        ...act,
        chapters: chapterRows
          .filter((chapter) => chapter.actId === act.id)
          .map((chapter) => ({
            ...chapter,
            scenes: sceneRows.filter((scene) => scene.chapterId === chapter.id),
          })),
      })),
      compendium: entries,
    };
  });
}
