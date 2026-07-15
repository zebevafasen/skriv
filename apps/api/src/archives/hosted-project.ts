import type { PortableArchiveAsset } from "@skriv/application";
import {
  projectArchiveV5Schema,
  projectSettingsSchema,
  sceneMetadataSchema,
  type ChatContextSource,
  type ProjectArchiveV5,
} from "@skriv/contracts";
import {
  acts,
  chapters,
  chatMessages,
  chatThreads,
  compendiumCategories,
  compendiumEntries,
  projectIngredientPacks,
  projectNotes,
  projects,
  sceneRevisions,
  scenes,
} from "@skriv/db";
import { asc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { ownedWorkspaceId } from "../ownership.js";

const iso = (value: Date) => value.toISOString();

function imageData(value: string | null): (PortableArchiveAsset & { extension: string }) | null {
  if (!value) return null;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const mime = match[1] as string;
  return {
    path: "",
    mime,
    extension: mime === "image/jpeg" ? "jpg" : (mime.split("/")[1] as string),
    bytes: new Uint8Array(Buffer.from(match[2] as string, "base64")),
  };
}

export async function loadHostedProjectArchive(
  context: AppContext,
  projectId: string,
): Promise<{ project: ProjectArchiveV5; assets: PortableArchiveAsset[] } | null> {
  const [project] = await context.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  const actRows = await context.db
    .select()
    .from(acts)
    .where(eq(acts.projectId, projectId))
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
  const revisionRows = sceneRows.length
    ? await context.db
        .select()
        .from(sceneRevisions)
        .where(
          inArray(
            sceneRevisions.sceneId,
            sceneRows.map((row) => row.id),
          ),
        )
        .orderBy(asc(sceneRevisions.createdAt))
    : [];
  const categoryRows = await context.db
    .select()
    .from(compendiumCategories)
    .where(eq(compendiumCategories.projectId, projectId))
    .orderBy(asc(compendiumCategories.position));
  const entryRows = await context.db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  const noteRows = await context.db
    .select()
    .from(projectNotes)
    .where(eq(projectNotes.projectId, projectId));
  const packRows = await context.db
    .select()
    .from(projectIngredientPacks)
    .where(eq(projectIngredientPacks.projectId, projectId));
  const threadRows = await context.db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.projectId, projectId));
  const messageRows = threadRows.length
    ? await context.db
        .select()
        .from(chatMessages)
        .where(
          inArray(
            chatMessages.threadId,
            threadRows.map((row) => row.id),
          ),
        )
        .orderBy(asc(chatMessages.createdAt))
    : [];
  const assets: PortableArchiveAsset[] = [];
  const references: ProjectArchiveV5["assets"] = [];
  const cover = imageData(project.settings.coverDataUrl);
  if (cover) {
    const path = `assets/cover.${cover.extension}`;
    assets.push({ path, mime: cover.mime, bytes: cover.bytes });
    references.push({ path, mime: cover.mime as "image/png", target: { kind: "cover" } });
  }
  for (const entry of entryRows) {
    const image = imageData(entry.imageDataUrl);
    if (!image) continue;
    const path = `assets/compendium/${entry.id}.${image.extension}`;
    assets.push({ path, mime: image.mime, bytes: image.bytes });
    references.push({
      path,
      mime: image.mime as "image/png",
      target: { kind: "compendium", entryId: entry.id },
    });
  }
  const archive = projectArchiveV5Schema.parse({
    schemaVersion: 5,
    project: {
      id: project.id,
      title: project.title,
      settings: {
        ...project.settings,
        coverDataUrl: null,
        coverArtworkSeed: project.settings.coverArtworkSeed || project.id,
      },
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
    },
    manuscript: actRows.map((act) => ({
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
          scenes: sceneRows
            .filter((scene) => scene.chapterId === chapter.id)
            .map((scene) => ({
              id: scene.id,
              chapterId: scene.chapterId,
              title: scene.title,
              position: scene.position,
              document: scene.document,
              plainText: scene.plainText,
              version: scene.version,
              metadata: scene.metadata,
              createdAt: iso(scene.createdAt),
              updatedAt: iso(scene.updatedAt),
              revisions: revisionRows
                .filter((revision) => revision.sceneId === scene.id)
                .map((revision) => ({
                  id: revision.id,
                  sceneId: revision.sceneId,
                  version: revision.version,
                  document: revision.document,
                  plainText: revision.plainText,
                  reason: revision.reason,
                  createdAt: iso(revision.createdAt),
                })),
            })),
        })),
    })),
    compendiumCategories: categoryRows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
    compendium: entryRows.map((row) => ({
      ...row,
      imageDataUrl: null,
      singleton: row.singletonKey !== null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
    notes: noteRows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
    projectIngredientPacks: packRows.map((row) => ({ ...row, importedAt: iso(row.importedAt) })),
    chatThreads: threadRows.map((thread) => ({
      id: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      model: thread.model,
      contextSources: thread.contextSources,
      rollingSummary: thread.rollingSummary,
      summarizedThroughMessageId: thread.summarizedThroughMessageId,
      createdAt: iso(thread.createdAt),
      updatedAt: iso(thread.updatedAt),
      messages: messageRows
        .filter((message) => message.threadId === thread.id)
        .map((message) => ({
          ...message,
          createdAt: iso(message.createdAt),
          updatedAt: iso(message.updatedAt),
        })),
    })),
    assets: references,
  });
  return { project: archive, assets };
}

function mapped(map: Map<string, string>, value: string | null): string | null {
  return value ? (map.get(value) ?? null) : null;
}

export async function importHostedProjectArchive(
  context: AppContext,
  userId: string,
  raw: unknown,
  assets: PortableArchiveAsset[],
) {
  const archive = projectArchiveV5Schema.parse(raw);
  const workspaceId = await ownedWorkspaceId(context, userId);
  const projectId = crypto.randomUUID();
  const categoryMap = new Map(
    archive.compendiumCategories.map((row) => [row.id, crypto.randomUUID()]),
  );
  const entryMap = new Map(archive.compendium.map((row) => [row.id, crypto.randomUUID()]));
  const actMap = new Map(archive.manuscript.map((row) => [row.id, crypto.randomUUID()]));
  const chapterRows = archive.manuscript.flatMap((row) => row.chapters);
  const chapterMap = new Map(chapterRows.map((row) => [row.id, crypto.randomUUID()]));
  const sceneRows = chapterRows.flatMap((row) => row.scenes);
  const sceneMap = new Map(sceneRows.map((row) => [row.id, crypto.randomUUID()]));
  const threadMap = new Map(archive.chatThreads.map((row) => [row.id, crypto.randomUUID()]));
  const messageMap = new Map(
    archive.chatThreads.flatMap((thread) =>
      thread.messages.map((message) => [message.id, crypto.randomUUID()] as const),
    ),
  );
  const assetMap = new Map(
    assets.map((asset) => [
      asset.path,
      `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}`,
    ]),
  );
  const assetFor = (kind: "cover" | "compendium", entryId?: string) =>
    archive.assets.find(
      (asset) =>
        asset.target.kind === kind &&
        (kind === "cover" ||
          (asset.target.kind === "compendium" && asset.target.entryId === entryId)),
    );
  let initialSceneId: string | null = null;
  const project = await context.db.transaction(async (tx) => {
    const cover = assetFor("cover");
    const [created] = await tx
      .insert(projects)
      .values({
        id: projectId,
        workspaceId,
        title: archive.project.title,
        settings: {
          ...projectSettingsSchema.parse(archive.project.settings),
          coverDataUrl: cover ? (assetMap.get(cover.path) ?? null) : null,
          coverArtworkSeed: archive.project.settings.coverArtworkSeed || archive.project.id,
          povCharacterEntryId: mapped(entryMap, archive.project.settings.povCharacterEntryId),
        },
      })
      .returning();
    if (!created) throw new Error("Project import failed.");
    if (archive.compendiumCategories.length)
      await tx.insert(compendiumCategories).values(
        archive.compendiumCategories.map((row) => ({
          id: categoryMap.get(row.id) as string,
          projectId,
          name: row.name,
          normalizedName: row.name.normalize("NFKC").toLocaleLowerCase(),
          position: row.position,
        })),
      );
    if (archive.projectIngredientPacks.length)
      await tx.insert(projectIngredientPacks).values(
        archive.projectIngredientPacks.map((row) => ({
          projectId,
          sourcePackId: row.sourcePackId,
          name: row.name,
          description: row.description,
          ownership: row.ownership,
          values: row.values,
          importedAt: new Date(row.importedAt),
        })),
      );
    for (const act of archive.manuscript) {
      const actId = actMap.get(act.id) as string;
      await tx
        .insert(acts)
        .values({ id: actId, projectId, title: act.title, position: act.position });
      for (const chapter of act.chapters) {
        const chapterId = chapterMap.get(chapter.id) as string;
        await tx
          .insert(chapters)
          .values({ id: chapterId, actId, title: chapter.title, position: chapter.position });
        for (const scene of chapter.scenes) {
          const sceneId = sceneMap.get(scene.id) as string;
          initialSceneId ??= sceneId;
          await tx.insert(scenes).values({
            id: sceneId,
            chapterId,
            title: scene.title,
            position: scene.position,
            document: scene.document,
            plainText: scene.plainText,
            version: scene.version,
            metadata: sceneMetadataSchema.parse({
              ...scene.metadata,
              povEntryId: mapped(entryMap, scene.metadata.povEntryId),
              locationEntryId: mapped(entryMap, scene.metadata.locationEntryId),
              presentCharacterEntryIds: scene.metadata.presentCharacterEntryIds.flatMap(
                (id) => entryMap.get(id) ?? [],
              ),
              manualCompendiumEntryIds: scene.metadata.manualCompendiumEntryIds.flatMap(
                (id) => entryMap.get(id) ?? [],
              ),
            }),
          });
          if (scene.revisions.length)
            await tx.insert(sceneRevisions).values(
              scene.revisions.map((revision) => ({
                id: crypto.randomUUID(),
                sceneId,
                version: revision.version,
                document: revision.document,
                plainText: revision.plainText,
                reason: revision.reason,
                createdBy: userId,
                createdAt: new Date(revision.createdAt),
              })),
            );
        }
      }
    }
    if (archive.compendium.length)
      await tx.insert(compendiumEntries).values(
        archive.compendium.map((entry) => {
          const image = assetFor("compendium", entry.id);
          return {
            id: entryMap.get(entry.id) as string,
            projectId,
            name: entry.name,
            typeId: entry.typeId.startsWith("custom.")
              ? `custom.${categoryMap.get(entry.typeId.slice(7)) ?? entry.typeId.slice(7)}`
              : entry.typeId,
            aliases: entry.aliases,
            labels: entry.labels,
            imageDataUrl: image ? (assetMap.get(image.path) ?? null) : null,
            trackingEnabled: entry.trackingEnabled,
            matchExclusions: entry.matchExclusions,
            activationMode: entry.activationMode,
            caseSensitive: entry.caseSensitive,
            content: entry.content,
            revision: entry.revision,
            singletonKey: entry.singletonKey,
          };
        }),
      );
    if (archive.notes.length)
      await tx.insert(projectNotes).values(
        archive.notes.map((note) => ({
          id: crypto.randomUUID(),
          projectId,
          title: note.title,
          document: note.document,
          plainText: note.plainText,
          pinned: note.pinned,
          version: note.version,
        })),
      );
    for (const thread of archive.chatThreads) {
      const threadId = threadMap.get(thread.id) as string;
      const contextSources: ChatContextSource[] = [];
      for (const source of thread.contextSources) {
        if (source.kind === "act") {
          const id = actMap.get(source.id);
          if (id) contextSources.push({ ...source, id });
        } else if (source.kind === "chapter") {
          const id = chapterMap.get(source.id);
          if (id) contextSources.push({ ...source, id });
        } else if (source.kind === "scene") {
          const id = sceneMap.get(source.id);
          if (id) contextSources.push({ ...source, id });
        } else if (source.kind === "compendium_entry") {
          const id = entryMap.get(source.id);
          if (id) contextSources.push({ ...source, id });
        } else if (source.kind === "compendium_type" && source.typeId.startsWith("custom."))
          contextSources.push({
            ...source,
            typeId: `custom.${categoryMap.get(source.typeId.slice(7)) ?? source.typeId.slice(7)}`,
          });
        else contextSources.push(source);
      }
      await tx.insert(chatThreads).values({
        id: threadId,
        projectId,
        userId,
        title: thread.title,
        model: thread.model,
        contextSources,
        rollingSummary: thread.rollingSummary,
        summarizedThroughMessageId: mapped(messageMap, thread.summarizedThroughMessageId),
      });
      if (thread.messages.length)
        await tx.insert(chatMessages).values(
          thread.messages.map((message) => ({
            id: messageMap.get(message.id) as string,
            threadId,
            role: message.role,
            content: message.content,
            status: message.status,
            model: message.model,
            failureMessage: message.failureMessage,
            inputTokens: message.inputTokens,
            outputTokens: message.outputTokens,
          })),
        );
    }
    return created;
  });
  return {
    project: {
      id: project.id,
      title: project.title,
      settings: project.settings,
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
    },
    initialSceneId,
  };
}
