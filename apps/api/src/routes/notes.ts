import {
  createProjectNoteInputSchema,
  idSchema,
  projectNoteSchema,
  updateProjectNoteInputSchema,
} from "@asterism/contracts";
import { projectNotes, projects, touchUpdatedAt, workspaceMembers } from "@asterism/db";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict, notFound, parseWith } from "../http.js";
import { ownsProject } from "../ownership.js";

const idParams = z.object({ id: idSchema });

function noteResponse(note: typeof projectNotes.$inferSelect) {
  return projectNoteSchema.parse({
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  });
}

async function ownedNote(context: AppContext, userId: string, noteId: string) {
  const [row] = await context.db
    .select({ note: projectNotes })
    .from(projectNotes)
    .innerJoin(projects, eq(projects.id, projectNotes.projectId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
    .where(and(eq(projectNotes.id, noteId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row?.note ?? null;
}

export async function registerNoteRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  app.get("/api/projects/:id/notes", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const rows = await context.db
      .select()
      .from(projectNotes)
      .where(eq(projectNotes.projectId, id))
      .orderBy(desc(projectNotes.pinned), desc(projectNotes.updatedAt));
    return rows.map(noteResponse);
  });

  app.post("/api/projects/:id/notes", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownsProject(context, request.userId, id)))
      return notFound(reply, "Project not found.");
    const input = parseWith(createProjectNoteInputSchema, request.body ?? {});
    const [note] = await context.db
      .insert(projectNotes)
      .values({ projectId: id, ...input })
      .returning();
    if (!note) throw new Error("Note creation failed.");
    return reply.code(201).send(noteResponse(note));
  });

  app.get("/api/notes/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const note = await ownedNote(context, request.userId, id);
    if (!note) return notFound(reply, "Note not found.");
    return noteResponse(note);
  });

  app.patch("/api/notes/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    const input = parseWith(updateProjectNoteInputSchema, request.body);
    const current = await ownedNote(context, request.userId, id);
    if (!current) return notFound(reply, "Note not found.");
    if (current.version !== input.expectedVersion) {
      return conflict(reply, "Note changed since it was loaded.", {
        currentVersion: current.version,
      });
    }
    const [updated] = await context.db
      .update(projectNotes)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.plainText !== undefined ? { plainText: input.plainText } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        version: current.version + 1,
        ...touchUpdatedAt,
      })
      .where(and(eq(projectNotes.id, id), eq(projectNotes.version, current.version)))
      .returning();
    if (!updated) return conflict(reply, "Note changed while it was being saved.");
    return noteResponse(updated);
  });

  app.delete("/api/notes/:id", async (request, reply) => {
    const { id } = parseWith(idParams, request.params);
    if (!(await ownedNote(context, request.userId, id))) return notFound(reply, "Note not found.");
    await context.db.delete(projectNotes).where(eq(projectNotes.id, id));
    return reply.code(204).send();
  });
}
