import type {
  ChatContextSource,
  CompendiumContent,
  EditorSettings,
  ProjectSettings,
  PromptMessage,
  SceneMetadata,
  IngredientPackValues,
  TiptapNode,
  WorkflowKey,
} from "@skriv/contracts";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner"] })
      .notNull()
      .default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const archiveTransfers = pgTable(
  "archive_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["import", "export"] }).notNull(),
    pathname: text("pathname").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("archive_transfers_pathname_idx").on(table.pathname)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  settings: jsonb("settings").$type<ProjectSettings>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const projectDefaults = pgTable("project_defaults", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  author: text("author").notNull().default(""),
  language: text("language").notNull().default("General English"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ingredientPacks = pgTable(
  "tag_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    collectionId: text("collection_id"),
    values: jsonb("values").$type<IngredientPackValues>().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("tag_packs_user_name_idx").on(table.userId, table.normalizedName)],
);

export const ingredientPackCatalogNodes = pgTable(
  "tag_pack_catalog_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["category", "collection"] }).notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    systemKey: text("system_key"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tag_pack_catalog_nodes_user_system_idx").on(table.userId, table.systemKey),
    uniqueIndex("tag_pack_catalog_nodes_user_parent_name_idx").on(
      table.userId,
      table.kind,
      table.parentId,
      table.normalizedName,
    ),
  ],
);

export const projectIngredientPacks = pgTable(
  "project_tag_packs",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePackId: text("source_pack_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ownership: text("ownership", { enum: ["builtin", "user"] }).notNull(),
    values: jsonb("values").$type<IngredientPackValues>().notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.sourcePackId] })],
);

export const compendiumCategories = pgTable(
  "compendium_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
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

export const projectNotes = pgTable("project_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  document: jsonb("document").$type<TiptapNode>().notNull(),
  plainText: text("plain_text").notNull().default(""),
  pinned: boolean("pinned").notNull().default(false),
  version: integer("version").notNull().default(1),
  ...timestamps,
});

export const acts = pgTable("acts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
});

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  actId: uuid("act_id")
    .notNull()
    .references(() => acts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
});

export const scenes = pgTable("scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  chapterId: uuid("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  document: jsonb("document").$type<TiptapNode>().notNull(),
  plainText: text("plain_text").notNull().default(""),
  version: integer("version").notNull().default(1),
  metadata: jsonb("metadata").$type<SceneMetadata>().notNull(),
  ...timestamps,
});

export const sceneRevisions = pgTable("scene_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  document: jsonb("document").$type<TiptapNode>().notNull(),
  plainText: text("plain_text").notNull(),
  reason: text("reason", {
    enum: ["autosave", "manual", "generation_accept", "restore"],
  }).notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activationModeEnum = pgEnum("activation_mode", [
  "mention",
  "always",
  "never",
  "smart",
]);

export const compendiumEntries = pgTable(
  "compendium_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    typeId: text("type_id").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    imageDataUrl: text("image_data_url"),
    trackingEnabled: boolean("tracking_enabled").notNull().default(true),
    matchExclusions: jsonb("match_exclusions").$type<string[]>().notNull().default([]),
    activationMode: activationModeEnum("activation_mode").notNull().default("mention"),
    caseSensitive: boolean("case_sensitive").notNull().default(false),
    content: jsonb("content").$type<CompendiumContent>().notNull(),
    revision: integer("revision").notNull().default(1),
    singletonKey: text("singleton_key"),
    ...timestamps,
  },
  (table) => [uniqueIndex("compendium_singleton_idx").on(table.projectId, table.singletonKey)],
);

export const promptDefinitions = pgTable("prompt_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  sourcePromptId: text("source_prompt_id"),
  name: text("name").notNull(),
  workflow: text("workflow").$type<WorkflowKey>().notNull(),
  version: integer("version").notNull().default(1),
  description: text("description").notNull().default(""),
  messages: jsonb("messages").$type<PromptMessage[]>().notNull(),
  variables: jsonb("variables").$type<string[]>().notNull(),
  ...timestamps,
});

export const workflowBindings = pgTable(
  "workflow_bindings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workflow: text("workflow").$type<WorkflowKey>().notNull(),
    promptDefinitionId: uuid("prompt_definition_id").references(() => promptDefinitions.id, {
      onDelete: "set null",
    }),
    builtinPromptId: text("builtin_prompt_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.workflow] })],
);

export const aiSettings = pgTable("ai_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  baseModel: text("base_model").notNull().default("skriv/fake-prose"),
  contextModel: text("context_model").notNull().default("skriv/fake-context"),
  smartContextEnabled: boolean("smart_context_enabled").notNull().default(true),
  recursionDepth: integer("recursion_depth").notNull().default(2),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: text("theme", { enum: ["system", "light", "dark", "midnight", "ocean", "forest", "sepia", "parchment"] })
    .$type<import("@skriv/contracts").AppSettings["theme"]>()
    .notNull()
    .default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const editorSettings = pgTable("editor_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["openrouter"] }).notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretTag: text("secret_tag").notNull(),
    secretLastFour: text("secret_last_four").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_credentials_user_provider_idx").on(table.userId, table.provider),
  ],
);

export const generationStatusEnum = pgEnum("generation_status", [
  "streaming",
  "completed",
  "accepted",
  "rejected",
  "cancelled",
  "failed",
]);

export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  parentGenerationId: uuid("parent_generation_id"),
  workflow: text("workflow").$type<WorkflowKey>().notNull(),
  model: text("model").notNull(),
  promptId: text("prompt_id").notNull(),
  sceneVersion: integer("scene_version").notNull(),
  cursorPosition: integer("cursor_position").notNull(),
  request: jsonb("request").$type<Record<string, unknown>>().notNull(),
  candidateText: text("candidate_text").notNull().default(""),
  status: generationStatusEnum("status").notNull().default("streaming"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  contextFallback: boolean("context_fallback").notNull().default(false),
  failureMessage: text("failure_message"),
  ...timestamps,
});

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New thread"),
  model: text("model").notNull(),
  contextSources: jsonb("context_sources").$type<ChatContextSource[]>().notNull().default([]),
  rollingSummary: text("rolling_summary").notNull().default(""),
  summarizedThroughMessageId: uuid("summarized_through_message_id"),
  ...timestamps,
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
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

export const userCollections = pgTable("user_collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["genre", "theme", "tag"] }).notNull(),
  values: jsonb("values").$type<Array<{ definitionId: string | null; label: string }>>().notNull(),
  ...timestamps,
});

export const userDefinitions = pgTable(
  "user_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["genre", "theme", "tag"] }).notNull(),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_definitions_user_kind_label_idx").on(
      table.userId,
      table.kind,
      table.normalizedLabel,
    ),
  ],
);

export const packageSettings = pgTable(
  "package_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    packageId: text("package_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.packageId] })],
);

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  role: text("role", {
    enum: ["writing", "context", "ideation", "compendium", "summary", "chat", "chat_utility"],
  }).notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  acts: many(acts),
  entries: many(compendiumEntries),
  notes: many(projectNotes),
  categories: many(compendiumCategories),
  ingredientPacks: many(projectIngredientPacks),
}));
export const projectIngredientPacksRelations = relations(projectIngredientPacks, ({ one }) => ({
  project: one(projects, {
    fields: [projectIngredientPacks.projectId],
    references: [projects.id],
  }),
}));
export const projectNotesRelations = relations(projectNotes, ({ one }) => ({
  project: one(projects, { fields: [projectNotes.projectId], references: [projects.id] }),
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

export const touchUpdatedAt = { updatedAt: sql`now()` };
