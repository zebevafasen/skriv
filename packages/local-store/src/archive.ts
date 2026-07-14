import { AppError } from "@asterism/application";
import { renderManuscriptExport, safeExportFilename } from "@asterism/application/exporter";
import {
  legacyProjectArchiveV4Schema,
  manuscriptExportOptionsSchema,
  projectArchiveV5Schema,
  projectSettingsSchema,
  sceneMetadataSchema,
  type ChatContextSource,
  type CompendiumContent,
  type ManuscriptExportOptions,
  type ProjectArchiveV5,
} from "@asterism/contracts";
import { asc, eq, inArray } from "drizzle-orm";
import { invoke } from "@tauri-apps/api/core";
import type { LocalDatabase } from "./database.js";
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
} from "./schema.js";

type NativeAsset = { path: string; mime: string; base64: string };
type OpenedProject =
  | { kind: "v5"; project: unknown; assets: NativeAsset[] }
  | { kind: "v4"; project: unknown };
type NativeArchiveAsset = { path: string; mime: string; bytes: number[] };

function fileError(error: unknown): AppError {
  const payload = error as { message?: string };
  return new AppError(payload.message ?? String(error), "FILE_ERROR");
}

function imageData(value: string | null) {
  if (!value) return null;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const raw = atob(match[2] as string);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  const mime = match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  return { mime, extension: mime === "image/jpeg" ? "jpg" : (mime.split("/")[1] as string), bytes };
}

async function loadArchiveProject(db: LocalDatabase, projectId: string): Promise<ProjectArchiveV5> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new AppError("Project not found.", "NOT_FOUND");
  const actRows = await db
    .select()
    .from(acts)
    .where(eq(acts.projectId, projectId))
    .orderBy(asc(acts.position));
  const chapterRows = actRows.length
    ? await db
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
    ? await db
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
    ? await db
        .select()
        .from(sceneRevisions)
        .where(
          inArray(
            sceneRevisions.sceneId,
            sceneRows.map((row) => row.id),
          ),
        )
    : [];
  const entryRows = await db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  const categoryRows = await db
    .select()
    .from(compendiumCategories)
    .where(eq(compendiumCategories.projectId, projectId))
    .orderBy(asc(compendiumCategories.position));
  const noteRows = await db
    .select()
    .from(projectNotes)
    .where(eq(projectNotes.projectId, projectId));
  const packRows = await db
    .select()
    .from(projectIngredientPacks)
    .where(eq(projectIngredientPacks.projectId, projectId));
  const threadRows = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.projectId, projectId));
  const messageRows = threadRows.length
    ? await db
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
  const assets: ProjectArchiveV5["assets"] = [];
  const cover = imageData(project.settings.coverDataUrl);
  if (cover)
    assets.push({
      path: `assets/cover.${cover.extension}`,
      mime: cover.mime,
      target: { kind: "cover" },
    });
  for (const entry of entryRows) {
    const image = imageData(entry.imageDataUrl);
    if (image)
      assets.push({
        path: `assets/compendium/${entry.id}.${image.extension}`,
        mime: image.mime,
        target: { kind: "compendium", entryId: entry.id },
      });
  }
  return projectArchiveV5Schema.parse({
    schemaVersion: 5,
    project: { ...project, settings: { ...project.settings, coverDataUrl: null } },
    manuscript: actRows.map((act) => ({
      ...act,
      chapters: chapterRows
        .filter((chapter) => chapter.actId === act.id)
        .map((chapter) => ({
          ...chapter,
          scenes: sceneRows
            .filter((scene) => scene.chapterId === chapter.id)
            .map((scene) => ({
              ...scene,
              revisions: revisionRows.filter((revision) => revision.sceneId === scene.id),
            })),
        })),
    })),
    compendiumCategories: categoryRows,
    compendium: entryRows.map((entry) => ({
      ...entry,
      imageDataUrl: null,
      singleton: entry.singletonKey !== null,
    })),
    notes: noteRows,
    projectIngredientPacks: packRows,
    chatThreads: threadRows.map((thread) => ({
      ...thread,
      messages: messageRows.filter((message) => message.threadId === thread.id),
    })),
    assets,
  });
}

async function loadArchiveAssets(
  db: LocalDatabase,
  projectId: string,
  archive: ProjectArchiveV5,
): Promise<NativeArchiveAsset[]> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const entries = await db
    .select()
    .from(compendiumEntries)
    .where(eq(compendiumEntries.projectId, projectId));
  return archive.assets.map((reference) => {
    let data: ReturnType<typeof imageData>;
    if (reference.target.kind === "cover") {
      data = imageData(project?.settings.coverDataUrl ?? null);
    } else {
      const entryId = reference.target.entryId;
      data = imageData(entries.find((entry) => entry.id === entryId)?.imageDataUrl ?? null);
    }
    if (!data) throw new AppError("An archive image could not be decoded.", "FILE_ERROR");
    return { path: reference.path, mime: reference.mime, bytes: Array.from(data.bytes) };
  });
}

export async function exportLocalProject(
  db: LocalDatabase,
  projectId: string,
  rawOptions: ManuscriptExportOptions,
): Promise<void> {
  const options = manuscriptExportOptionsSchema.parse(rawOptions);
  const archive = await loadArchiveProject(db, projectId);
  const baseName = safeExportFilename(archive.project.title);
  if (options.format === "json") {
    const assetPayload = await loadArchiveAssets(db, projectId, archive);
    await invoke("save_project_archive", {
      request: {
        suggestedName: `${baseName}.asterism`,
        applicationVersion: "0.1.1",
        project: archive,
        assets: assetPayload,
      },
    }).catch((error) => {
      throw fileError(error);
    });
    return;
  }
  const rendered = await renderManuscriptExport(
    {
      project: archive.project,
      manuscript: archive.manuscript.map((act) => ({
        title: act.title,
        chapters: act.chapters.map((chapter) => ({
          title: chapter.title,
          scenes: chapter.scenes.map((scene) => ({ title: scene.title, document: scene.document })),
        })),
      })),
    },
    options,
  );
  await invoke("save_bytes", {
    request: {
      suggestedName: `${baseName}.${rendered.extension}`,
      extension: rendered.extension,
      label:
        rendered.extension === "md"
          ? "Markdown"
          : rendered.extension === "docx"
            ? "Word document"
            : "PDF",
      bytes: Array.from(rendered.bytes),
    },
  }).catch((error) => {
    throw fileError(error);
  });
}

export async function writeLocalProjectBackup(db: LocalDatabase, projectId: string): Promise<void> {
  const archive = await loadArchiveProject(db, projectId);
  const assets = await loadArchiveAssets(db, projectId, archive);
  await invoke("write_project_backup", {
    request: {
      projectId,
      title: archive.project.title,
      applicationVersion: "0.1.1",
      project: archive,
      assets,
    },
  }).catch((error) => {
    throw fileError(error);
  });
}

function remap<T>(map: Map<string, string>, value: T): T | null {
  if (typeof value !== "string") return value;
  return (map.get(value) ?? null) as T | null;
}

async function importV5(db: LocalDatabase, raw: unknown, nativeAssets: NativeAsset[]) {
  const archive = projectArchiveV5Schema.parse(raw);
  const assetMap = new Map(
    nativeAssets.map((asset) => [asset.path, `data:${asset.mime};base64,${asset.base64}`]),
  );
  if (archive.assets.some((asset) => !assetMap.has(asset.path)))
    throw new AppError("Archive image is missing.", "FILE_ERROR");
  const projectId = crypto.randomUUID();
  const categoryMap = new Map(
    archive.compendiumCategories.map((item) => [item.id, crypto.randomUUID()]),
  );
  const entryMap = new Map(archive.compendium.map((item) => [item.id, crypto.randomUUID()]));
  const actMap = new Map(archive.manuscript.map((item) => [item.id, crypto.randomUUID()]));
  const chapterItems = archive.manuscript.flatMap((item) => item.chapters);
  const chapterMap = new Map(chapterItems.map((item) => [item.id, crypto.randomUUID()]));
  const sceneRows = chapterItems.flatMap((item) => item.scenes);
  const sceneMap = new Map(sceneRows.map((item) => [item.id, crypto.randomUUID()]));
  const threadMap = new Map(archive.chatThreads.map((item) => [item.id, crypto.randomUUID()]));
  const messageMap = new Map(
    archive.chatThreads.flatMap((thread) =>
      thread.messages.map((message) => [message.id, crypto.randomUUID()] as const),
    ),
  );
  const assetFor = (kind: "cover" | "compendium", entryId?: string) =>
    archive.assets.find(
      (asset) =>
        asset.target.kind === kind &&
        (kind === "cover" ||
          (asset.target.kind === "compendium" && asset.target.entryId === entryId)),
    );
  let initialSceneId: string | null = null;
  const project = await db.transaction(async (tx) => {
    const cover = assetFor("cover");
    const [createdProject] = await tx
      .insert(projects)
      .values({
        id: projectId,
        title: archive.project.title,
        settings: {
          ...archive.project.settings,
          coverDataUrl: cover ? (assetMap.get(cover.path) ?? null) : null,
          povCharacterEntryId: remap(entryMap, archive.project.settings.povCharacterEntryId),
        },
      })
      .returning();
    if (!createdProject) throw new AppError("Project import failed.", "DATABASE_ERROR");
    if (archive.compendiumCategories.length)
      await tx.insert(compendiumCategories).values(
        archive.compendiumCategories.map((item) => ({
          id: categoryMap.get(item.id) as string,
          projectId,
          name: item.name,
          normalizedName: item.name.normalize("NFKC").toLocaleLowerCase(),
          position: item.position,
        })),
      );
    if (archive.projectIngredientPacks.length)
      await tx.insert(projectIngredientPacks).values(
        archive.projectIngredientPacks.map((item) => ({
          projectId,
          sourcePackId: item.sourcePackId,
          name: item.name,
          description: item.description,
          ownership: item.ownership,
          values: item.values,
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
              povEntryId: remap(entryMap, scene.metadata.povEntryId),
              locationEntryId: remap(entryMap, scene.metadata.locationEntryId),
              presentCharacterEntryIds: scene.metadata.presentCharacterEntryIds.flatMap(
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
        } else if (source.kind === "compendium_type" && source.typeId.startsWith("custom.")) {
          contextSources.push({
            ...source,
            typeId: `custom.${categoryMap.get(source.typeId.slice(7)) ?? source.typeId.slice(7)}`,
          });
        } else {
          contextSources.push(source);
        }
      }
      await tx.insert(chatThreads).values({
        id: threadId,
        projectId,
        title: thread.title,
        model: thread.model,
        contextSources,
        rollingSummary: thread.rollingSummary,
        summarizedThroughMessageId: remap(messageMap, thread.summarizedThroughMessageId),
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
    return createdProject;
  });
  return { project, initialSceneId };
}

async function importV4(db: LocalDatabase, raw: unknown) {
  const archive = legacyProjectArchiveV4Schema.parse(raw);
  const projectId = crypto.randomUUID();
  const categoryMap = new Map(
    archive.compendiumCategories.map((item) => [item.id, crypto.randomUUID()]),
  );
  const entryMap = new Map(
    archive.compendium.flatMap((item) =>
      item.id ? [[item.id, crypto.randomUUID()] as const] : [],
    ),
  );
  let initialSceneId: string | null = null;
  const project = await db.transaction(async (tx) => {
    const settings = projectSettingsSchema.parse(archive.project.settings ?? {});
    const [created] = await tx
      .insert(projects)
      .values({
        id: projectId,
        title: archive.project.title,
        settings: {
          ...settings,
          povCharacterEntryId: remap(entryMap, settings.povCharacterEntryId),
        },
      })
      .returning();
    if (!created) throw new AppError("Project import failed.", "DATABASE_ERROR");
    if (archive.compendiumCategories.length)
      await tx.insert(compendiumCategories).values(
        archive.compendiumCategories.map((item) => ({
          id: categoryMap.get(item.id) as string,
          projectId,
          name: item.name,
          normalizedName: item.name.normalize("NFKC").toLocaleLowerCase(),
          position: item.position,
        })),
      );
    if (archive.projectTagPacks.length)
      await tx
        .insert(projectIngredientPacks)
        .values(archive.projectTagPacks.map((item) => ({ projectId, ...item })));
    for (const [actPosition, act] of archive.manuscript.entries()) {
      const actId = crypto.randomUUID();
      await tx
        .insert(acts)
        .values({ id: actId, projectId, title: act.title, position: act.position ?? actPosition });
      for (const [chapterPosition, chapter] of act.chapters.entries()) {
        const chapterId = crypto.randomUUID();
        await tx.insert(chapters).values({
          id: chapterId,
          actId,
          title: chapter.title,
          position: chapter.position ?? chapterPosition,
        });
        for (const [scenePosition, scene] of chapter.scenes.entries()) {
          const sceneId = crypto.randomUUID();
          initialSceneId ??= sceneId;
          await tx.insert(scenes).values({
            id: sceneId,
            chapterId,
            title: scene.title,
            position: scene.position ?? scenePosition,
            document: scene.document,
            plainText: scene.plainText,
            version: scene.version,
            metadata: sceneMetadataSchema.parse({
              ...scene.metadata,
              povEntryId: remap(entryMap, scene.metadata.povEntryId),
              locationEntryId: remap(entryMap, scene.metadata.locationEntryId),
              presentCharacterEntryIds: scene.metadata.presentCharacterEntryIds.flatMap(
                (id) => entryMap.get(id) ?? [],
              ),
            }),
          });
        }
      }
    }
    if (archive.compendium.length)
      await tx.insert(compendiumEntries).values(
        archive.compendium.map((entry) => ({
          id: entry.id ? (entryMap.get(entry.id) as string) : crypto.randomUUID(),
          projectId,
          name: entry.name,
          typeId: entry.typeId.startsWith("custom.")
            ? `custom.${categoryMap.get(entry.typeId.slice(7)) ?? entry.typeId.slice(7)}`
            : entry.typeId,
          aliases: entry.aliases,
          labels: entry.labels,
          imageDataUrl: entry.imageDataUrl ?? null,
          trackingEnabled: entry.trackingEnabled,
          matchExclusions: entry.matchExclusions,
          activationMode: entry.activationMode,
          caseSensitive: entry.caseSensitive,
          content: entry.content,
          singletonKey: entry.singletonKey ?? null,
        })),
      );
    const singletonKeys = new Set(
      archive.compendium.map((entry) => entry.singletonKey).filter(Boolean),
    );
    const singletonDefaults: Array<{
      key: string;
      name: string;
      typeId: string;
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
      {
        key: "tags",
        name: "Tags",
        typeId: "project.tags",
        content: { kind: "selection", values: [] },
      },
    ];
    const missing = singletonDefaults.filter(({ key }) => !singletonKeys.has(key));
    if (missing.length)
      await tx.insert(compendiumEntries).values(
        missing.map(({ key, name, typeId, content }) => ({
          id: crypto.randomUUID(),
          projectId,
          name,
          typeId,
          aliases: [],
          labels: [],
          imageDataUrl: null,
          trackingEnabled: true,
          matchExclusions: [],
          activationMode: "always" as const,
          caseSensitive: false,
          content,
          singletonKey: key,
        })),
      );
    if (archive.notes.length)
      await tx
        .insert(projectNotes)
        .values(archive.notes.map((note) => ({ id: crypto.randomUUID(), projectId, ...note })));
    else if (settings.notes.trim()) {
      const text = settings.notes.trim();
      await tx.insert(projectNotes).values({
        id: crypto.randomUUID(),
        projectId,
        title: "Project Notes",
        document: {
          type: "doc",
          content: text.split(/\r?\n/).map((line) => ({
            type: "paragraph",
            ...(line ? { content: [{ type: "text", text: line }] } : {}),
          })),
        },
        plainText: text,
        pinned: true,
      });
    }
    return created;
  });
  return { project, initialSceneId };
}

export async function importLocalProject(db: LocalDatabase) {
  const opened = await invoke<OpenedProject | null>("open_project_archive").catch((error) => {
    throw fileError(error);
  });
  if (!opened) return null;
  return opened.kind === "v5"
    ? importV5(db, opened.project, opened.assets)
    : importV4(db, opened.project);
}

export async function importLegacyProjectBody(db: LocalDatabase, body: unknown) {
  return importV4(db, body);
}
