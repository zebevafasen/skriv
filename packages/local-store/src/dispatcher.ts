import { AppError, type ClientRequest } from "@skriv/application";
import { basePackage, getOutlinePreset } from "@skriv/content";
import {
  createActInputSchema,
  createChapterInputSchema,
  createCompendiumCategoryInputSchema,
  createCompendiumEntryInputSchema,
  createManuscriptItemInputSchema,
  createProjectInputSchema,
  createProjectNoteInputSchema,
  createSceneInputSchema,
  emptyTiptapDocument,
  projectDefaultsSchema,
  projectSettingsSchema,
  reorderInputSchema,
  sceneMetadataSchema,
  updateCompendiumCategoryInputSchema,
  updateCompendiumEntryInputSchema,
  updateProjectInputSchema,
  updateProjectNoteInputSchema,
  updateSceneInputSchema,
  type ChatStreamEvent,
  type CompendiumContent,
  type GenerationRequest,
  type GenerationStreamEvent,
} from "@skriv/contracts";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createLocalDatabase, type LocalDatabase } from "./database.js";
import {
  acts,
  aiSettings,
  chapters,
  compendiumCategories,
  compendiumEntries,
  editorSettings,
  ingredientPacks,
  packageSettings,
  projectDefaults,
  projectIngredientPacks,
  projectNotes,
  projects,
  sceneRevisions,
  scenes,
  touchUpdatedAt,
  userCollections,
  userDefinitions,
} from "./schema.js";
import { handleSettingsAndPrompts } from "./settings-prompts.js";
import { handleGenerationRoutes, streamLocalGeneration } from "./generation.js";
import { handleChatRoutes, streamLocalChat } from "./chat.js";
import { handleCatalogRoutes } from "./catalog.js";
import { handleIdeationRoutes } from "./ideation.js";
import {
  exportLocalProject,
  importLegacyProjectBody,
  importLocalProject,
  writeLocalProjectBackup,
} from "./archive.js";

const idSchema = z.uuid();
const renameSchema = z.object({ title: z.string().trim().max(300) });
const defaultSceneMetadata = sceneMetadataSchema.parse({});

const singletonEntries: Array<{
  key: string;
  name: string;
  typeId: "project.premise" | "project.genres" | "project.themes" | "project.tags";
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

function jsonBody(init: ClientRequest | undefined): unknown {
  if (init?.body === undefined || init.body === null || init.body === "") return {};
  if (typeof init.body !== "string") {
    throw new AppError("Desktop requests require a JSON string body.", "BAD_REQUEST");
  }
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    throw new AppError("Request body is not valid JSON.", "BAD_REQUEST");
  }
}

function notFound(message: string): never {
  throw new AppError(message, "NOT_FOUND");
}

function conflict(message: string, details?: unknown): never {
  throw new AppError(message, "CONFLICT", details);
}

function entryResponse(entry: typeof compendiumEntries.$inferSelect) {
  return { ...entry, singleton: entry.singletonKey !== null };
}

async function ensureDefaults(db: LocalDatabase): Promise<void> {
  await db
    .insert(projectDefaults)
    .values({ id: 1, author: "", language: "General English" })
    .onConflictDoNothing();
  await db
    .insert(aiSettings)
    .values({
      id: 1,
      baseModel: "openrouter/auto",
      contextModel: "openrouter/auto",
      smartContextEnabled: true,
      recursionDepth: 2,
    })
    .onConflictDoNothing();
  await db.insert(editorSettings).values({ id: 1 }).onConflictDoNothing();
  await db
    .insert(packageSettings)
    .values({ packageId: basePackage.id, enabled: true })
    .onConflictDoNothing();
}

async function projectExists(db: LocalDatabase, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return Boolean(row);
}

async function loadProjectTree(db: LocalDatabase, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) notFound("Project not found.");
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
            actRows.map((act) => act.id),
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
            chapterRows.map((chapter) => chapter.id),
          ),
        )
        .orderBy(asc(scenes.position))
    : [];
  return {
    project: { ...project, settings: projectSettingsSchema.parse(project.settings) },
    acts: actRows.map((act) => ({
      ...act,
      chapters: chapterRows
        .filter((chapter) => chapter.actId === act.id)
        .map((chapter) => ({
          ...chapter,
          scenes: sceneRows.filter((scene) => scene.chapterId === chapter.id),
        })),
    })),
  };
}

async function nextPosition(
  db: LocalDatabase,
  kind: "act" | "chapter" | "scene",
  parentId: string,
): Promise<number> {
  if (kind === "act") {
    const [row] = await db
      .select({ value: acts.position })
      .from(acts)
      .where(eq(acts.projectId, parentId))
      .orderBy(desc(acts.position))
      .limit(1);
    return (row?.value ?? -1) + 1;
  }
  if (kind === "chapter") {
    const [row] = await db
      .select({ value: chapters.position })
      .from(chapters)
      .where(eq(chapters.actId, parentId))
      .orderBy(desc(chapters.position))
      .limit(1);
    return (row?.value ?? -1) + 1;
  }
  const [row] = await db
    .select({ value: scenes.position })
    .from(scenes)
    .where(eq(scenes.chapterId, parentId))
    .orderBy(desc(scenes.position))
    .limit(1);
  return (row?.value ?? -1) + 1;
}

async function createProject(db: LocalDatabase, body: unknown) {
  const input = createProjectInputSchema.parse(body);
  const projectId = crypto.randomUUID();
  const projectSettings = projectSettingsSchema.parse({
    author: input.author,
    language: input.language,
  });
  const builtinPacks = basePackage.ingredientPacks;
  const customPacks = await db.select().from(ingredientPacks);
  const availablePacks = [
    ...builtinPacks.map((pack) => ({ ...pack, ownership: "builtin" as const })),
    ...customPacks.map((pack) => ({ ...pack, ownership: "user" as const })),
  ];
  const selectedPacks = input.ingredientPackIds.map((id) =>
    availablePacks.find((pack) => pack.id === id),
  );
  if (selectedPacks.some((pack) => !pack)) {
    throw new AppError("One or more ingredient packs were not found.", "BAD_REQUEST");
  }

  type SeedAct = {
    title: string;
    chapters: Array<{ title: string; scenes: Array<{ title: string; summary: string }> }>;
  };
  let seed: SeedAct[];
  if (input.outline.kind === "preset") {
    seed = getOutlinePreset(input.outline.presetId).acts;
  } else if (input.outline.kind === "project") {
    const source = await loadProjectTree(db, input.outline.projectId);
    seed = source.acts.map((act) => ({
      title: "",
      chapters: act.chapters.map((chapter) => ({
        title: "",
        scenes: chapter.scenes.map(() => ({ title: "", summary: "" })),
      })),
    }));
  } else {
    seed = [{ title: "", chapters: [{ title: "", scenes: [{ title: "", summary: "" }] }] }];
  }
  if (!seed.some((act) => act.chapters.some((chapter) => chapter.scenes.length))) {
    seed = [{ title: "", chapters: [{ title: "", scenes: [{ title: "", summary: "" }] }] }];
  }

  let initialSceneId: string | null = null;
  await db.transaction(async (tx) => {
    await tx
      .insert(projects)
      .values({ id: projectId, title: input.title, settings: projectSettings });
    for (const [actPosition, actSeed] of seed.entries()) {
      const actId = crypto.randomUUID();
      await tx.insert(acts).values({
        id: actId,
        projectId,
        title: actSeed.title,
        position: actPosition,
      });
      for (const [chapterPosition, chapterSeed] of actSeed.chapters.entries()) {
        const chapterId = crypto.randomUUID();
        await tx.insert(chapters).values({
          id: chapterId,
          actId,
          title: chapterSeed.title,
          position: chapterPosition,
        });
        for (const [scenePosition, sceneSeed] of chapterSeed.scenes.entries()) {
          const sceneId = crypto.randomUUID();
          initialSceneId ??= sceneId;
          await tx.insert(scenes).values({
            id: sceneId,
            chapterId,
            title: sceneSeed.title,
            position: scenePosition,
            document: emptyTiptapDocument,
            plainText: "",
            metadata: sceneMetadataSchema.parse({ summary: sceneSeed.summary }),
          });
        }
      }
    }
    await tx.insert(compendiumEntries).values(
      singletonEntries.map((entry) => ({
        id: crypto.randomUUID(),
        projectId,
        name: entry.name,
        typeId: entry.typeId,
        aliases: [],
        labels: [],
        imageDataUrl: null,
        trackingEnabled: true,
        matchExclusions: [],
        activationMode: "always" as const,
        caseSensitive: false,
        content: entry.content,
        singletonKey: entry.key,
      })),
    );
    const validPacks = selectedPacks.filter((pack) => pack !== undefined);
    if (validPacks.length) {
      await tx.insert(projectIngredientPacks).values(
        validPacks.map((pack) => ({
          projectId,
          sourcePackId: pack.id,
          name: pack.name,
          description: pack.description,
          ownership: pack.ownership,
          values: pack.values,
        })),
      );
    }
  });

  if (input.compendiumCopy?.entryIds.length) {
    await copyCompendiumEntries(
      db,
      projectId,
      input.compendiumCopy.sourceProjectId,
      input.compendiumCopy.entryIds,
    );
  }
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new AppError("Project creation failed.", "DATABASE_ERROR");
  return { project, initialSceneId };
}

async function copyCompendiumEntries(
  db: LocalDatabase,
  projectId: string,
  sourceProjectId: string,
  entryIds: string[],
): Promise<void> {
  const entries = await db
    .select()
    .from(compendiumEntries)
    .where(
      and(
        eq(compendiumEntries.projectId, sourceProjectId),
        inArray(compendiumEntries.id, entryIds),
      ),
    );
  if (entries.length !== new Set(entryIds).size || entries.some((entry) => entry.singletonKey)) {
    throw new AppError("One or more selected Compendium entries cannot be copied.", "BAD_REQUEST");
  }
  const sourceCategoryIds = [
    ...new Set(
      entries
        .filter((entry) => entry.typeId.startsWith("custom."))
        .map((entry) => entry.typeId.slice("custom.".length)),
    ),
  ];
  const sourceCategories = sourceCategoryIds.length
    ? await db
        .select()
        .from(compendiumCategories)
        .where(
          and(
            eq(compendiumCategories.projectId, sourceProjectId),
            inArray(compendiumCategories.id, sourceCategoryIds),
          ),
        )
    : [];
  const categoryMap = new Map<string, string>();
  await db.transaction(async (tx) => {
    for (const category of sourceCategories) {
      const id = crypto.randomUUID();
      categoryMap.set(category.id, id);
      await tx.insert(compendiumCategories).values({
        id,
        projectId,
        name: category.name,
        normalizedName: category.normalizedName,
        position: category.position,
      });
    }
    for (const entry of entries) {
      await tx.insert(compendiumEntries).values({
        id: crypto.randomUUID(),
        projectId,
        name: entry.name,
        typeId: entry.typeId.startsWith("custom.")
          ? `custom.${categoryMap.get(entry.typeId.slice("custom.".length))}`
          : entry.typeId,
        aliases: entry.aliases,
        labels: entry.labels,
        imageDataUrl: entry.imageDataUrl,
        trackingEnabled: entry.trackingEnabled,
        matchExclusions: entry.matchExclusions,
        activationMode: entry.activationMode,
        caseSensitive: entry.caseSensitive,
        content: entry.content,
        singletonKey: null,
      });
    }
  });
}

async function handleProjects(db: LocalDatabase, method: string, path: string, body: unknown) {
  if (path === "/api/projects" && method === "GET") {
    const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    return rows.map((project) => ({
      ...project,
      settings: projectSettingsSchema.parse(project.settings),
    }));
  }
  if (path === "/api/projects" && method === "POST") return createProject(db, body);

  const treeMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/tree$/i);
  if (treeMatch && method === "GET") return loadProjectTree(db, idSchema.parse(treeMatch[1]));

  const projectMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)$/i);
  if (projectMatch) {
    const id = idSchema.parse(projectMatch[1]);
    if (method === "PATCH") {
      const input = updateProjectInputSchema.parse(body);
      const [current] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (!current) notFound("Project not found.");
      const [updated] = await db
        .update(projects)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.settings !== undefined
            ? { settings: projectSettingsSchema.parse({ ...current.settings, ...input.settings }) }
            : {}),
          ...touchUpdatedAt,
        })
        .where(eq(projects.id, id))
        .returning();
      return updated;
    }
    if (method === "DELETE") {
      if (!(await projectExists(db, id))) notFound("Project not found.");
      await db.delete(projects).where(eq(projects.id, id));
      return undefined;
    }
  }
  return null;
}

async function handleSceneRoutes(db: LocalDatabase, method: string, path: string, body: unknown) {
  const revisionsMatch = path.match(/^\/api\/scenes\/([0-9a-f-]+)\/revisions$/i);
  if (revisionsMatch && method === "GET") {
    const sceneId = idSchema.parse(revisionsMatch[1]);
    return db
      .select()
      .from(sceneRevisions)
      .where(eq(sceneRevisions.sceneId, sceneId))
      .orderBy(desc(sceneRevisions.createdAt))
      .limit(100);
  }
  const restoreMatch = path.match(
    /^\/api\/scenes\/([0-9a-f-]+)\/revisions\/([0-9a-f-]+)\/restore$/i,
  );
  if (restoreMatch && method === "POST") {
    const sceneId = idSchema.parse(restoreMatch[1]);
    const revisionId = idSchema.parse(restoreMatch[2]);
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
    if (!scene) notFound("Scene not found.");
    const [revision] = await db
      .select()
      .from(sceneRevisions)
      .where(and(eq(sceneRevisions.id, revisionId), eq(sceneRevisions.sceneId, sceneId)))
      .limit(1);
    if (!revision) notFound("Revision not found.");
    const restored = await db.transaction(async (tx) => {
      await tx.insert(sceneRevisions).values({
        id: crypto.randomUUID(),
        sceneId,
        version: scene.version,
        document: scene.document,
        plainText: scene.plainText,
        reason: "restore",
      });
      const [updated] = await tx
        .update(scenes)
        .set({
          document: revision.document,
          plainText: revision.plainText,
          version: scene.version + 1,
          ...touchUpdatedAt,
        })
        .where(and(eq(scenes.id, sceneId), eq(scenes.version, scene.version)))
        .returning();
      if (!updated) conflict("Scene changed while the revision was restored.");
      return updated;
    });
    return restored;
  }

  const sceneMatch = path.match(/^\/api\/scenes\/([0-9a-f-]+)$/i);
  if (!sceneMatch) return null;
  const id = idSchema.parse(sceneMatch[1]);
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
  if (!scene) notFound("Scene not found.");
  if (method === "GET") return scene;
  if (method === "DELETE") {
    await db.delete(scenes).where(eq(scenes.id, id));
    return undefined;
  }
  if (method === "PATCH") {
    const input = updateSceneInputSchema.parse(body);
    if (scene.version !== input.expectedVersion) {
      conflict("Scene changed since it was loaded.", { currentVersion: scene.version });
    }
    const updated = await db.transaction(async (tx) => {
      if (input.document && input.plainText !== undefined) {
        await tx.insert(sceneRevisions).values({
          id: crypto.randomUUID(),
          sceneId: id,
          version: scene.version,
          document: scene.document,
          plainText: scene.plainText,
          reason: input.revisionReason,
        });
      }
      const [saved] = await tx
        .update(scenes)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.document !== undefined ? { document: input.document } : {}),
          ...(input.plainText !== undefined ? { plainText: input.plainText } : {}),
          ...(input.metadata !== undefined
            ? {
                metadata: {
                  ...scene.metadata,
                  ...Object.fromEntries(
                    Object.entries(input.metadata).filter(([, value]) => value !== undefined),
                  ),
                },
              }
            : {}),
          version: scene.version + 1,
          ...touchUpdatedAt,
        })
        .where(and(eq(scenes.id, id), eq(scenes.version, input.expectedVersion)))
        .returning();
      if (!saved) conflict("Scene changed while it was being saved.");
      return saved;
    });
    return updated;
  }
  return null;
}

async function handleHierarchy(db: LocalDatabase, method: string, path: string, body: unknown) {
  const createActMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/acts$/i);
  if (createActMatch && method === "POST") {
    const projectId = idSchema.parse(createActMatch[1]);
    const input = createActInputSchema.parse(body);
    const [created] = await db
      .insert(acts)
      .values({
        id: crypto.randomUUID(),
        projectId,
        title: input.title,
        position: await nextPosition(db, "act", projectId),
      })
      .returning();
    return created;
  }
  const createChapterMatch = path.match(/^\/api\/acts\/([0-9a-f-]+)\/chapters$/i);
  if (createChapterMatch && method === "POST") {
    const actId = idSchema.parse(createChapterMatch[1]);
    const input = createChapterInputSchema.parse(body);
    const [created] = await db
      .insert(chapters)
      .values({
        id: crypto.randomUUID(),
        actId,
        title: input.title,
        position: await nextPosition(db, "chapter", actId),
      })
      .returning();
    return created;
  }
  const createSceneMatch = path.match(/^\/api\/chapters\/([0-9a-f-]+)\/scenes$/i);
  if (createSceneMatch && method === "POST") {
    const chapterId = idSchema.parse(createSceneMatch[1]);
    const input = createSceneInputSchema.parse(body);
    const [created] = await db
      .insert(scenes)
      .values({
        id: crypto.randomUUID(),
        chapterId,
        title: input.title,
        position: await nextPosition(db, "scene", chapterId),
        document: emptyTiptapDocument,
        plainText: "",
        metadata: defaultSceneMetadata,
      })
      .returning();
    return created;
  }
  const createItemMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/manuscript-items$/i);
  if (createItemMatch && method === "POST") {
    const projectId = idSchema.parse(createItemMatch[1]);
    const input = createManuscriptItemInputSchema.parse(body);
    return createManuscriptItem(db, projectId, input);
  }

  const entityMatch = path.match(/^\/api\/(acts|chapters)\/([0-9a-f-]+)$/i);
  if (entityMatch) {
    const kind = entityMatch[1];
    const id = idSchema.parse(entityMatch[2]);
    if (method === "PATCH") {
      const { title } = renameSchema.parse(body);
      if (kind === "acts") {
        const [updated] = await db
          .update(acts)
          .set({ title, ...touchUpdatedAt })
          .where(eq(acts.id, id))
          .returning();
        if (!updated) notFound("Act not found.");
        return updated;
      }
      const [updated] = await db
        .update(chapters)
        .set({ title, ...touchUpdatedAt })
        .where(eq(chapters.id, id))
        .returning();
      if (!updated) notFound("Chapter not found.");
      return updated;
    }
    if (method === "DELETE") {
      if (kind === "acts") await db.delete(acts).where(eq(acts.id, id));
      else await db.delete(chapters).where(eq(chapters.id, id));
      return undefined;
    }
  }

  const reorderActMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/acts\/reorder$/i);
  if (reorderActMatch && method === "POST") {
    const projectId = idSchema.parse(reorderActMatch[1]);
    const { orderedIds } = reorderInputSchema.parse(body);
    const rows = await db.select({ id: acts.id }).from(acts).where(eq(acts.projectId, projectId));
    if (rows.length !== orderedIds.length || rows.some((row) => !orderedIds.includes(row.id))) {
      conflict("Reorder list must contain every Act exactly once.");
    }
    await db.transaction(async (tx) => {
      for (const [position, id] of orderedIds.entries()) {
        await tx
          .update(acts)
          .set({ position, ...touchUpdatedAt })
          .where(eq(acts.id, id));
      }
    });
    return undefined;
  }
  const reorderChildMatch = path.match(
    /^\/api\/(acts|chapters)\/([0-9a-f-]+)\/(chapters|scenes)\/reorder$/i,
  );
  if (reorderChildMatch && method === "POST") {
    const parentKind = reorderChildMatch[1];
    const parentId = idSchema.parse(reorderChildMatch[2]);
    const childKind = reorderChildMatch[3];
    const { orderedIds } = reorderInputSchema.parse(body);
    if (parentKind === "acts" && childKind === "chapters") {
      const rows = await db
        .select({ id: chapters.id })
        .from(chapters)
        .where(eq(chapters.actId, parentId));
      if (rows.length !== orderedIds.length || rows.some((row) => !orderedIds.includes(row.id))) {
        conflict("Reorder list must contain every Chapter exactly once.");
      }
      await db.transaction(async (tx) => {
        for (const [position, id] of orderedIds.entries()) {
          await tx
            .update(chapters)
            .set({ position, ...touchUpdatedAt })
            .where(eq(chapters.id, id));
        }
      });
      return undefined;
    }
    if (parentKind === "chapters" && childKind === "scenes") {
      const rows = await db
        .select({ id: scenes.id })
        .from(scenes)
        .where(eq(scenes.chapterId, parentId));
      if (rows.length !== orderedIds.length || rows.some((row) => !orderedIds.includes(row.id))) {
        conflict("Reorder list must contain every Scene exactly once.");
      }
      await db.transaction(async (tx) => {
        for (const [position, id] of orderedIds.entries()) {
          await tx
            .update(scenes)
            .set({ position, ...touchUpdatedAt })
            .where(eq(scenes.id, id));
        }
      });
      return undefined;
    }
  }
  return null;
}

async function createManuscriptItem(
  db: LocalDatabase,
  projectId: string,
  input: z.infer<typeof createManuscriptItemInputSchema>,
) {
  let createdActId: string | null = null;
  let createdChapterId: string | null = null;
  let createdSceneId = "";
  await db.transaction(async (tx) => {
    if (input.kind === "act") {
      createdActId = crypto.randomUUID();
      createdChapterId = crypto.randomUUID();
      createdSceneId = crypto.randomUUID();
      const position = await nextPosition(db, "act", projectId);
      await tx.insert(acts).values({ id: createdActId, projectId, title: "", position });
      await tx
        .insert(chapters)
        .values({ id: createdChapterId, actId: createdActId, title: "", position: 0 });
      await tx.insert(scenes).values({
        id: createdSceneId,
        chapterId: createdChapterId,
        title: "",
        position: 0,
        document: emptyTiptapDocument,
        plainText: "",
        metadata: defaultSceneMetadata,
      });
      return;
    }
    if (input.kind === "chapter") {
      createdChapterId = crypto.randomUUID();
      createdSceneId = crypto.randomUUID();
      const position = await nextPosition(db, "chapter", input.actId);
      await tx
        .insert(chapters)
        .values({ id: createdChapterId, actId: input.actId, title: "", position });
      await tx.insert(scenes).values({
        id: createdSceneId,
        chapterId: createdChapterId,
        title: "",
        position: 0,
        document: emptyTiptapDocument,
        plainText: "",
        metadata: defaultSceneMetadata,
      });
      return;
    }
    createdSceneId = crypto.randomUUID();
    const position = await nextPosition(db, "scene", input.chapterId);
    await tx.insert(scenes).values({
      id: createdSceneId,
      chapterId: input.chapterId,
      title: "",
      position,
      document: emptyTiptapDocument,
      plainText: "",
      metadata: defaultSceneMetadata,
    });
  });
  return {
    kind: input.kind,
    createdActId,
    createdChapterId,
    createdSceneId,
    initialSceneId: createdSceneId,
  };
}

async function handleNotes(db: LocalDatabase, method: string, path: string, body: unknown) {
  const projectMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/notes$/i);
  if (projectMatch) {
    const projectId = idSchema.parse(projectMatch[1]);
    if (method === "GET") {
      return db
        .select()
        .from(projectNotes)
        .where(eq(projectNotes.projectId, projectId))
        .orderBy(desc(projectNotes.pinned), desc(projectNotes.updatedAt));
    }
    if (method === "POST") {
      const input = createProjectNoteInputSchema.parse(body);
      const [created] = await db
        .insert(projectNotes)
        .values({ id: crypto.randomUUID(), projectId, ...input })
        .returning();
      return created;
    }
  }
  const noteMatch = path.match(/^\/api\/notes\/([0-9a-f-]+)$/i);
  if (!noteMatch) return null;
  const id = idSchema.parse(noteMatch[1]);
  const [note] = await db.select().from(projectNotes).where(eq(projectNotes.id, id)).limit(1);
  if (!note) notFound("Note not found.");
  if (method === "GET") return note;
  if (method === "DELETE") {
    await db.delete(projectNotes).where(eq(projectNotes.id, id));
    return undefined;
  }
  if (method === "PATCH") {
    const input = updateProjectNoteInputSchema.parse(body);
    if (input.expectedVersion !== note.version) conflict("Note changed since it was loaded.");
    const [updated] = await db
      .update(projectNotes)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.plainText !== undefined ? { plainText: input.plainText } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        version: note.version + 1,
        ...touchUpdatedAt,
      })
      .where(and(eq(projectNotes.id, id), eq(projectNotes.version, input.expectedVersion)))
      .returning();
    if (!updated) conflict("Note changed while it was being saved.");
    return updated;
  }
  return null;
}

async function handleCompendium(db: LocalDatabase, method: string, path: string, body: unknown) {
  const projectEntries = path.match(/^\/api\/projects\/([0-9a-f-]+)\/compendium$/i);
  if (projectEntries) {
    const projectId = idSchema.parse(projectEntries[1]);
    if (method === "GET") {
      const rows = await db
        .select()
        .from(compendiumEntries)
        .where(eq(compendiumEntries.projectId, projectId));
      return rows.map(entryResponse);
    }
    if (method === "POST") {
      const input = createCompendiumEntryInputSchema.parse(body);
      const [created] = await db
        .insert(compendiumEntries)
        .values({
          id: crypto.randomUUID(),
          projectId,
          name: input.name,
          typeId: input.typeId,
          aliases: input.aliases ?? [],
          labels: input.labels ?? [],
          imageDataUrl: input.imageDataUrl ?? null,
          trackingEnabled: input.trackingEnabled ?? true,
          matchExclusions: input.matchExclusions ?? [],
          activationMode: input.activationMode ?? "mention",
          caseSensitive: input.caseSensitive ?? false,
          content: input.content,
          singletonKey: null,
        })
        .returning();
      if (!created) throw new AppError("Compendium entry creation failed.", "DATABASE_ERROR");
      return entryResponse(created);
    }
  }
  const entryMatch = path.match(/^\/api\/compendium\/([0-9a-f-]+)$/i);
  if (entryMatch) {
    const id = idSchema.parse(entryMatch[1]);
    const [entry] = await db
      .select()
      .from(compendiumEntries)
      .where(eq(compendiumEntries.id, id))
      .limit(1);
    if (!entry) notFound("Compendium entry not found.");
    if (method === "GET") return entryResponse(entry);
    if (method === "DELETE") {
      if (entry.singletonKey) conflict("Built-in project entries cannot be deleted.");
      await db.delete(compendiumEntries).where(eq(compendiumEntries.id, id));
      return undefined;
    }
    if (method === "PATCH") {
      const input = updateCompendiumEntryInputSchema.parse(body);
      if (entry.revision !== input.expectedRevision)
        conflict("Compendium entry changed since it was loaded.");
      const { expectedRevision: _, ...changes } = input;
      const [updated] = await db
        .update(compendiumEntries)
        .set({ ...changes, revision: entry.revision + 1, ...touchUpdatedAt })
        .where(
          and(eq(compendiumEntries.id, id), eq(compendiumEntries.revision, input.expectedRevision)),
        )
        .returning();
      if (!updated) conflict("Compendium entry changed while it was being saved.");
      return entryResponse(updated);
    }
  }

  const categoriesMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/compendium-categories$/i);
  if (categoriesMatch) {
    const projectId = idSchema.parse(categoriesMatch[1]);
    if (method === "GET") {
      return db
        .select()
        .from(compendiumCategories)
        .where(eq(compendiumCategories.projectId, projectId))
        .orderBy(asc(compendiumCategories.position));
    }
    if (method === "POST") {
      const input = createCompendiumCategoryInputSchema.parse(body);
      const [positionRow] = await db
        .select({ value: compendiumCategories.position })
        .from(compendiumCategories)
        .where(eq(compendiumCategories.projectId, projectId))
        .orderBy(desc(compendiumCategories.position))
        .limit(1);
      const [created] = await db
        .insert(compendiumCategories)
        .values({
          id: crypto.randomUUID(),
          projectId,
          name: input.name,
          normalizedName: input.name.normalize("NFKC").toLocaleLowerCase(),
          position: (positionRow?.value ?? -1) + 1,
        })
        .returning();
      return created;
    }
  }
  const categoryMatch = path.match(/^\/api\/compendium-categories\/([0-9a-f-]+)$/i);
  if (categoryMatch) {
    const id = idSchema.parse(categoryMatch[1]);
    const [category] = await db
      .select()
      .from(compendiumCategories)
      .where(eq(compendiumCategories.id, id))
      .limit(1);
    if (!category) notFound("Compendium category not found.");
    if (method === "PATCH") {
      const input = updateCompendiumCategoryInputSchema.parse(body);
      const [updated] = await db
        .update(compendiumCategories)
        .set({
          name: input.name,
          normalizedName: input.name.normalize("NFKC").toLocaleLowerCase(),
          ...touchUpdatedAt,
        })
        .where(eq(compendiumCategories.id, id))
        .returning();
      return updated;
    }
    if (method === "DELETE") {
      await db.transaction(async (tx) => {
        await tx
          .update(compendiumEntries)
          .set({ typeId: "story.other", ...touchUpdatedAt })
          .where(
            and(
              eq(compendiumEntries.projectId, category.projectId),
              eq(compendiumEntries.typeId, `custom.${id}`),
            ),
          );
        await tx.delete(compendiumCategories).where(eq(compendiumCategories.id, id));
      });
      return undefined;
    }
  }
  return null;
}

async function handleSetup(db: LocalDatabase, method: string, path: string, body: unknown) {
  if (path === "/api/project-defaults") {
    if (method === "GET") {
      const [row] = await db
        .select()
        .from(projectDefaults)
        .where(eq(projectDefaults.id, 1))
        .limit(1);
      return projectDefaultsSchema.parse(row ?? {});
    }
    if (method === "PUT") {
      const input = projectDefaultsSchema.parse(body);
      const [saved] = await db
        .insert(projectDefaults)
        .values({ id: 1, ...input })
        .onConflictDoUpdate({
          target: projectDefaults.id,
          set: { ...input, ...touchUpdatedAt },
        })
        .returning();
      return saved;
    }
  }
  if (path === "/api/ideation/definitions" && method === "GET") {
    const [setting] = await db
      .select()
      .from(packageSettings)
      .where(eq(packageSettings.packageId, basePackage.id))
      .limit(1);
    return {
      package: basePackage,
      enabled: setting?.enabled ?? true,
      collections: await db.select().from(userCollections),
      customDefinitions: await db.select().from(userDefinitions),
    };
  }
  return null;
}

async function route(
  db: LocalDatabase,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  await ensureDefaults(db);
  for (const handler of [
    handleProjects,
    handleSceneRoutes,
    handleHierarchy,
    handleNotes,
    handleCompendium,
    handleSetup,
    handleSettingsAndPrompts,
    handleGenerationRoutes,
    handleChatRoutes,
    handleCatalogRoutes,
    handleIdeationRoutes,
  ]) {
    const result = await handler(db, method, path, body);
    if (result !== null) return result;
  }
  throw new AppError(`Desktop operation is not implemented: ${method} ${path}`, "NOT_FOUND");
}

export type LocalRequestDispatcher = {
  request<T>(path: string, init?: ClientRequest): Promise<T>;
  streamGeneration(
    input: GenerationRequest,
    onEvent: (event: GenerationStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  streamChat(
    path: string,
    content: string | null,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  exportProject(
    projectId: string,
    options: import("@skriv/contracts").ManuscriptExportOptions,
  ): Promise<void>;
  importProject(): Promise<import("@skriv/application").ImportedProject | null>;
  backupAll(): Promise<void>;
  shutdown(): Promise<void>;
};

export function createLocalRequestDispatcher(
  db: LocalDatabase = createLocalDatabase(),
): LocalRequestDispatcher {
  const backupInterval = 15 * 60 * 1_000;
  const dirtyProjects = new Set<string>();
  const lastBackup = new Map<string, number>();
  let backupTimer: ReturnType<typeof setTimeout> | null = null;
  let tail: Promise<void> = Promise.resolve();
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const scheduleBackups = () => {
    if (backupTimer || dirtyProjects.size === 0) return;
    const now = Date.now();
    const delay = Math.max(
      0,
      Math.min(...[...dirtyProjects].map((id) => (lastBackup.get(id) ?? 0) + backupInterval - now)),
    );
    backupTimer = setTimeout(() => {
      backupTimer = null;
      void serialized(() => backupDirtyProjects(false));
    }, delay);
  };

  const backupDirtyProjects = async (force: boolean) => {
    if (backupTimer) {
      clearTimeout(backupTimer);
      backupTimer = null;
    }
    const now = Date.now();
    for (const projectId of [...dirtyProjects]) {
      if (!force && now - (lastBackup.get(projectId) ?? 0) < backupInterval) continue;
      await writeLocalProjectBackup(db, projectId);
      dirtyProjects.delete(projectId);
      lastBackup.set(projectId, Date.now());
    }
    scheduleBackups();
  };

  const markAllProjectsDirty = async () => {
    const rows = await db.select({ id: projects.id }).from(projects);
    for (const row of rows) dirtyProjects.add(row.id);
    await backupDirtyProjects(false);
  };

  const projectMutation = (method: string, path: string) => {
    if (method === "GET") return false;
    return !(
      path.startsWith("/api/settings/") ||
      path.startsWith("/api/prompts") ||
      path === "/api/prompt-bindings" ||
      path === "/api/project-defaults" ||
      path.startsWith("/api/ingredient-pack-catalog") ||
      path.startsWith("/api/ingredient-packs") ||
      path.startsWith("/api/ingredient-pack-categories") ||
      path.startsWith("/api/ingredient-pack-collections") ||
      /^\/api\/ideation\/(definitions|base-package|collections)/.test(path)
    );
  };

  const runRequest = async <T>(path: string, init?: ClientRequest): Promise<T> => {
    const method = init?.method ?? "GET";
    const deleting = method === "DELETE" ? path.match(/^\/api\/projects\/([0-9a-f-]+)$/i) : null;
    if (deleting && (await projectExists(db, deleting[1] as string))) {
      await writeLocalProjectBackup(db, deleting[1] as string);
      dirtyProjects.delete(deleting[1] as string);
      lastBackup.delete(deleting[1] as string);
    }
    const result =
      path === "/api/projects/import" && method === "POST"
        ? await importLegacyProjectBody(db, jsonBody(init))
        : await route(db, method, path, jsonBody(init));
    if (projectMutation(method, path)) await markAllProjectsDirty();
    return result as T;
  };

  return {
    request<T>(path: string, init?: ClientRequest) {
      const method = init?.method ?? "GET";
      if (
        method === "POST" &&
        (/\/stop$/.test(path) || /^\/api\/generations\/[0-9a-f-]+\/cancel$/i.test(path))
      ) {
        return route(db, method, path, jsonBody(init)) as Promise<T>;
      }
      return serialized(() => runRequest<T>(path, init));
    },
    streamGeneration(input, onEvent, signal) {
      return serialized(() => streamLocalGeneration(db, input, onEvent, signal));
    },
    streamChat(path, content, onEvent, signal) {
      return serialized(async () => {
        try {
          await streamLocalChat(db, path, content, onEvent, signal);
        } finally {
          await markAllProjectsDirty();
        }
      });
    },
    exportProject(projectId, options) {
      return serialized(() => exportLocalProject(db, projectId, options));
    },
    importProject() {
      return serialized(async () => {
        const imported = await importLocalProject(db);
        if (imported) await markAllProjectsDirty();
        return imported;
      });
    },
    backupAll() {
      return serialized(async () => {
        const rows = await db.select({ id: projects.id }).from(projects);
        for (const row of rows) dirtyProjects.add(row.id);
        await backupDirtyProjects(true);
      });
    },
    shutdown() {
      return serialized(() => backupDirtyProjects(true));
    },
  };
}
