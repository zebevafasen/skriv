import { acts, chapters, projects, scenes, workspaceMembers } from "@asterism/db";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "./context.js";

export async function ownedWorkspaceId(context: AppContext, userId: string): Promise<string> {
  const [membership] = await context.db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  if (!membership) throw new Error("User has no workspace.");
  return membership.workspaceId;
}

export async function ownsProject(
  context: AppContext,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await context.db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
    .where(and(eq(projects.id, projectId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function ownedScene(context: AppContext, userId: string, sceneId: string) {
  const [row] = await context.db
    .select({ scene: scenes, projectId: projects.id, project: projects })
    .from(scenes)
    .innerJoin(chapters, eq(chapters.id, scenes.chapterId))
    .innerJoin(acts, eq(acts.id, chapters.actId))
    .innerJoin(projects, eq(projects.id, acts.projectId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
    .where(and(eq(scenes.id, sceneId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function ownedAct(context: AppContext, userId: string, actId: string) {
  const [row] = await context.db
    .select({ act: acts, projectId: projects.id })
    .from(acts)
    .innerJoin(projects, eq(projects.id, acts.projectId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
    .where(and(eq(acts.id, actId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function ownedChapter(context: AppContext, userId: string, chapterId: string) {
  const [row] = await context.db
    .select({ chapter: chapters, projectId: projects.id })
    .from(chapters)
    .innerJoin(acts, eq(acts.id, chapters.actId))
    .innerJoin(projects, eq(projects.id, acts.projectId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, projects.workspaceId))
    .where(and(eq(chapters.id, chapterId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}
