import type {
  ChatContextSource,
  CompendiumContent,
  EditorSettings,
  IngredientPackValues,
  ProjectSettings,
  PromptMessage,
  SceneMetadata,
  TiptapNode,
  WorkflowKey,
} from "@skriv/contracts";
import { relations, sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestamps = {
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
};

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  settings: text("settings", { mode: "json" }).$type<ProjectSettings>().notNull(),
  ...timestamps,
});

export const projectDefaults = sqliteTable("project_defaults", {
  id: integer("id").primaryKey().default(1),
  author: text("author").notNull().default(""),
  language: text("language").notNull().default("General English"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const ingredientPacks = sqliteTable(
  "ingredient_packs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    collectionId: text("collection_id"),
    values: text("values", { mode: "json" }).$type<IngredientPackValues>().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("ingredient_packs_name_idx").on(table.normalizedName)],
);

export const ingredientPackCatalogNodes = sqliteTable(
  "ingredient_pack_catalog_nodes",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["category", "collection"] }).notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    systemKey: text("system_key"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ingredient_nodes_system_idx").on(table.systemKey),
    uniqueIndex("ingredient_nodes_parent_name_idx").on(
      table.kind,
      table.parentId,
      table.normalizedName,
    ),
  ],
);

export const projectIngredientPacks = sqliteTable(
  "project_ingredient_packs",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePackId: text("source_pack_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ownership: text("ownership", { enum: ["builtin", "user"] }).notNull(),
    values: text("values", { mode: "json" }).$type<IngredientPackValues>().notNull(),
    importedAt: text("imported_at").notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.sourcePackId] })],
);

export const compendiumCategories = sqliteTable(
  "compendium_categories",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("compendium_categories_project_name_idx").on(table.projectId, table.normalizedName),
  ],
);

export const projectNotes = sqliteTable("project_notes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  document: text("document", { mode: "json" }).$type<TiptapNode>().notNull(),
  plainText: text("plain_text").notNull().default(""),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  version: integer("version").notNull().default(1),
  ...timestamps,
});

export const acts = sqliteTable("acts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
});

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  actId: text("act_id")
    .notNull()
    .references(() => acts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
});

export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  document: text("document", { mode: "json" }).$type<TiptapNode>().notNull(),
  plainText: text("plain_text").notNull().default(""),
  version: integer("version").notNull().default(1),
  metadata: text("metadata", { mode: "json" }).$type<SceneMetadata>().notNull(),
  ...timestamps,
});

export const sceneRevisions = sqliteTable("scene_revisions", {
  id: text("id").primaryKey(),
  sceneId: text("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  document: text("document", { mode: "json" }).$type<TiptapNode>().notNull(),
  plainText: text("plain_text").notNull(),
  reason: text("reason", {
    enum: ["autosave", "manual", "generation_accept", "restore"],
  }).notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const compendiumEntries = sqliteTable(
  "compendium_entries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    typeId: text("type_id").notNull(),
    aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull(),
    labels: text("labels", { mode: "json" }).$type<string[]>().notNull(),
    imageDataUrl: text("image_data_url"),
    trackingEnabled: integer("tracking_enabled", { mode: "boolean" }).notNull().default(true),
    matchExclusions: text("match_exclusions", { mode: "json" }).$type<string[]>().notNull(),
    activationMode: text("activation_mode", { enum: ["mention", "always", "never", "smart"] })
      .notNull()
      .default("mention"),
    caseSensitive: integer("case_sensitive", { mode: "boolean" }).notNull().default(false),
    content: text("content", { mode: "json" }).$type<CompendiumContent>().notNull(),
    revision: integer("revision").notNull().default(1),
    singletonKey: text("singleton_key"),
    ...timestamps,
  },
  (table) => [uniqueIndex("compendium_singleton_idx").on(table.projectId, table.singletonKey)],
);

export const promptDefinitions = sqliteTable("prompt_definitions", {
  id: text("id").primaryKey(),
  sourcePromptId: text("source_prompt_id"),
  name: text("name").notNull(),
  workflow: text("workflow").$type<WorkflowKey>().notNull(),
  version: integer("version").notNull().default(1),
  description: text("description").notNull().default(""),
  messages: text("messages", { mode: "json" }).$type<PromptMessage[]>().notNull(),
  variables: text("variables", { mode: "json" }).$type<string[]>().notNull(),
  ...timestamps,
});

export const workflowBindings = sqliteTable("workflow_bindings", {
  workflow: text("workflow").$type<WorkflowKey>().primaryKey(),
  promptDefinitionId: text("prompt_definition_id").references(() => promptDefinitions.id, {
    onDelete: "set null",
  }),
  builtinPromptId: text("builtin_prompt_id"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const aiSettings = sqliteTable("ai_settings", {
  id: integer("id").primaryKey().default(1),
  baseModel: text("base_model").notNull().default(""),
  contextModel: text("context_model").notNull().default(""),
  smartContextEnabled: integer("smart_context_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  recursionDepth: integer("recursion_depth").notNull().default(2),
  updatedAt: text("updated_at").notNull().default(now),
});

export const editorSettings = sqliteTable("editor_settings", {
  id: integer("id").primaryKey().default(1),
  fontFamily: text("font_family", { enum: ["literary", "classic", "sans"] })
    .$type<EditorSettings["fontFamily"]>()
    .notNull()
    .default("literary"),
  fontSize: integer("font_size").notNull().default(18),
  lineHeight: real("line_height").notNull().default(1.85),
  paragraphSpacing: real("paragraph_spacing").notNull().default(1.15),
  firstLineIndent: real("first_line_indent").notNull().default(0),
  pageWidth: integer("page_width").notNull().default(920),
  textAlign: text("text_align", { enum: ["left", "justify", "center", "right"] })
    .$type<EditorSettings["textAlign"]>()
    .notNull()
    .default("left"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  theme: text("theme")
    .$type<import("@skriv/contracts").AppSettings["theme"]>()
    .notNull()
    .default("system"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  sceneId: text("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  parentGenerationId: text("parent_generation_id"),
  workflow: text("workflow").$type<WorkflowKey>().notNull(),
  model: text("model").notNull(),
  promptId: text("prompt_id").notNull(),
  sceneVersion: integer("scene_version").notNull(),
  cursorPosition: integer("cursor_position").notNull(),
  request: text("request", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  candidateText: text("candidate_text").notNull().default(""),
  status: text("status", {
    enum: ["streaming", "completed", "accepted", "rejected", "cancelled", "failed"],
  })
    .notNull()
    .default("streaming"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  contextFallback: integer("context_fallback", { mode: "boolean" }).notNull().default(false),
  failureMessage: text("failure_message"),
  ...timestamps,
});

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New thread"),
  model: text("model").notNull(),
  contextSources: text("context_sources", { mode: "json" }).$type<ChatContextSource[]>().notNull(),
  rollingSummary: text("rolling_summary").notNull().default(""),
  summarizedThroughMessageId: text("summarized_through_message_id"),
  ...timestamps,
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull().default(""),
  status: text("status", { enum: ["streaming", "completed", "cancelled", "failed"] })
    .notNull()
    .default("completed"),
  model: text("model"),
  failureMessage: text("failure_message"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  ...timestamps,
});

export const userCollections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["genre", "theme", "tag"] }).notNull(),
  values: text("values", { mode: "json" })
    .$type<Array<{ definitionId: string | null; label: string }>>()
    .notNull(),
  ...timestamps,
});

export const userDefinitions = sqliteTable(
  "definitions",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["genre", "theme", "tag"] }).notNull(),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("definitions_kind_label_idx").on(table.kind, table.normalizedLabel)],
);

export const packageSettings = sqliteTable("package_settings", {
  packageId: text("package_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(now),
});

export const appPreferences = sqliteTable("app_preferences", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  acts: many(acts),
  entries: many(compendiumEntries),
  notes: many(projectNotes),
  categories: many(compendiumCategories),
  ingredientPacks: many(projectIngredientPacks),
  chatThreads: many(chatThreads),
}));

export const actsRelations = relations(acts, ({ one, many }) => ({
  project: one(projects, { fields: [acts.projectId], references: [projects.id] }),
  chapters: many(chapters),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  act: one(acts, { fields: [chapters.actId], references: [acts.id] }),
  scenes: many(scenes),
}));

export const scenesRelations = relations(scenes, ({ one, many }) => ({
  chapter: one(chapters, { fields: [scenes.chapterId], references: [chapters.id] }),
  revisions: many(sceneRevisions),
}));

export const touchUpdatedAt = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` };
