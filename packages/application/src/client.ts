import type {
  AiSettings,
  AppSettings,
  ChatContextSource,
  ChatStreamEvent,
  ChatThread,
  CompendiumCategory,
  CompendiumEntry,
  ContentPackage,
  EditorSettings,
  ExtractCompendiumResponse,
  GenerationRequest,
  GenerationStreamEvent,
  IngredientPack,
  IngredientPackCatalog,
  ManuscriptExportOptions,
  ManuscriptTree,
  OpenRouterCredentialStatus,
  Project,
  ProjectDefaults,
  ProjectIngredientPack,
  ProjectNote,
  PromptDefinition,
  Scene,
  TiptapNode,
  WorkflowKey,
} from "@skriv/contracts";

export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "UNSUPPORTED"
  | "VALIDATION_ERROR"
  | "PROVIDER_ERROR"
  | "CREDENTIAL_ERROR"
  | "CANCELLED"
  | "DATABASE_ERROR"
  | "FILE_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: AppErrorCode,
    readonly details?: unknown,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ClientRequest = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: HeadersInit;
  body?: BodyInit | null;
};

/** Internal adapter boundary. URL-shaped operations stop here and never reach React. */
export type RequestTransport = {
  request<T>(path: string, init?: ClientRequest): Promise<T>;
};

export type CreatedProject = { project: Project; initialSceneId: string | null };
export type ImportedProject = CreatedProject;
export type ModelOption = {
  id: string;
  name: string;
  contextLength: number;
  maxCompletionTokens: number | null;
};
export type DatabaseSnapshot = { name: string; createdAt: string; size: number };
export type PlatformCapabilities = {
  platform: "web" | "desktop";
  accounts: boolean;
  invitations: boolean;
  localBackups: boolean;
  nativeFileDialogs: boolean;
};
export type DefinitionKind = "genre" | "theme" | "tag";
export type CustomDefinition = { id: string; kind: DefinitionKind; label: string };
export type IdeationCollection = {
  id: string;
  name: string;
  kind: DefinitionKind;
  values: Array<{ definitionId: string | null; label: string }>;
};
export type IdeationDefinitions = {
  package: ContentPackage;
  enabled?: boolean;
  collections?: IdeationCollection[];
  customDefinitions: CustomDefinition[];
};
export type IdeationValue = { definitionId: string | null; label: string; locked: boolean };
export type IdeationMetadata = {
  premise: { kind: "text"; text: string };
  genres: { kind: "selection"; values: IdeationValue[] };
  themes: { kind: "selection"; values: IdeationValue[] };
  tags: { kind: "selection"; values: IdeationValue[] };
};
export type IdeationSaveInput = {
  premise: string;
  genres: IdeationValue[];
  themes: IdeationValue[];
  tags: IdeationValue[];
};
export type PromptPayload = {
  prompts: PromptDefinition[];
  bindings: Array<{
    workflow: WorkflowKey;
    promptDefinitionId: string | null;
    builtinPromptId: string | null;
  }>;
};

type JsonInput = object;
type ItemKind = "act" | "chapter" | "scene";
type CatalogKind = "categories" | "collections";

export type ProjectsClient = {
  list(): Promise<Project[]>;
  create(input: JsonInput): Promise<CreatedProject>;
  update(projectId: string, input: JsonInput): Promise<Project>;
  remove(projectId: string): Promise<void>;
  tree(projectId: string): Promise<ManuscriptTree>;
  defaults(): Promise<ProjectDefaults>;
  updateDefaults(input: ProjectDefaults): Promise<ProjectDefaults>;
};

export type ManuscriptClient = {
  scene(sceneId: string): Promise<Scene>;
  updateScene(sceneId: string, input: JsonInput): Promise<Scene>;
  revisions(sceneId: string): Promise<
    Array<{
      id: string;
      sceneId: string;
      version: number;
      document: TiptapNode;
      plainText: string;
      reason: string;
      createdAt: string;
    }>
  >;
  restoreRevision(sceneId: string, revisionId: string): Promise<Scene>;
  createItem(
    projectId: string,
    input: JsonInput,
  ): Promise<import("@skriv/contracts").CreateManuscriptItemResponse>;
  updateItem(kind: ItemKind, id: string, input: JsonInput): Promise<unknown>;
  removeItem(kind: ItemKind, id: string): Promise<void>;
  reorderActs(projectId: string, orderedIds: string[]): Promise<void>;
  reorderChapters(actId: string, orderedIds: string[]): Promise<void>;
  reorderScenes(chapterId: string, orderedIds: string[]): Promise<void>;
  generateSummary(sceneId: string, input: JsonInput): Promise<Scene>;
};

export type NotesClient = {
  list(projectId: string): Promise<ProjectNote[]>;
  get(noteId: string): Promise<ProjectNote>;
  create(projectId: string, input: JsonInput): Promise<ProjectNote>;
  update(noteId: string, input: JsonInput): Promise<ProjectNote>;
  remove(noteId: string): Promise<void>;
};

export type CompendiumClient = {
  list(projectId: string): Promise<CompendiumEntry[]>;
  categories(projectId: string): Promise<CompendiumCategory[]>;
  create(projectId: string, input: JsonInput): Promise<CompendiumEntry>;
  update(entryId: string, input: JsonInput): Promise<CompendiumEntry>;
  remove(entryId: string): Promise<void>;
  createCategory(projectId: string, input: JsonInput): Promise<CompendiumCategory>;
  updateCategory(categoryId: string, input: JsonInput): Promise<CompendiumCategory>;
  removeCategory(categoryId: string): Promise<void>;
};

export type IdeationClient = {
  definitions(): Promise<IdeationDefinitions>;
  createDefinition(input: JsonInput): Promise<{ id: string; kind: DefinitionKind; label: string }>;
  metadata(projectId: string): Promise<IdeationMetadata>;
  updateMetadata(projectId: string, input: IdeationSaveInput): Promise<unknown>;
  generate<T extends string | { name: string; description: string }>(
    projectId: string,
    input: JsonInput,
  ): Promise<{ alternatives: T[] }>;
  projectPacks(projectId: string): Promise<ProjectIngredientPack[]>;
  syncProjectPacks(
    projectId: string,
    ingredientPackIds: string[],
  ): Promise<ProjectIngredientPack[]>;
  extractCompendium(projectId: string, input: JsonInput): Promise<ExtractCompendiumResponse>;
  importCompendium(projectId: string, input: JsonInput): Promise<CompendiumEntry[]>;
  catalog(): Promise<IngredientPackCatalog>;
  createCatalogNode(kind: CatalogKind, input: JsonInput): Promise<unknown>;
  updateCatalogNode(kind: CatalogKind, id: string, input: JsonInput): Promise<unknown>;
  removeCatalogNode(kind: CatalogKind, id: string): Promise<void>;
  createPack(input: JsonInput): Promise<IngredientPack>;
  updatePack(id: string, input: JsonInput): Promise<IngredientPack>;
  removePack(id: string): Promise<void>;
};

export type PromptsClient = {
  list(): Promise<PromptPayload>;
  copy(promptId: string): Promise<PromptDefinition>;
  create(input: JsonInput): Promise<PromptDefinition>;
  update(promptId: string, input: JsonInput): Promise<PromptDefinition>;
  remove(promptId: string): Promise<void>;
  bind(workflow: WorkflowKey, promptId: string | null): Promise<void>;
};

export type SettingsClient = {
  app(): Promise<AppSettings>;
  updateApp(input: Partial<AppSettings>): Promise<AppSettings>;
  ai(): Promise<AiSettings>;
  updateAi(input: Partial<AiSettings>): Promise<AiSettings>;
  editor(): Promise<EditorSettings>;
  updateEditor(input: Partial<EditorSettings>): Promise<EditorSettings>;
  models(): Promise<ModelOption[]>;
  credential(): Promise<OpenRouterCredentialStatus>;
  saveCredential(apiKey: string): Promise<OpenRouterCredentialStatus>;
  deleteCredential(): Promise<void>;
};

export type BackupsClient = {
  databaseSnapshots(): Promise<DatabaseSnapshot[]>;
  backupNow(): Promise<unknown>;
  openBackupFolder(): Promise<void>;
  restoreDatabaseSnapshot(name: string): Promise<void>;
};

export type GenerationClient = {
  start(
    input: GenerationRequest,
    onEvent: (event: GenerationStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  accept(generationId: string, input: JsonInput): Promise<Scene>;
  reject(generationId: string): Promise<void>;
  cancel(generationId: string, input?: JsonInput): Promise<void>;
};

export type ChatClient = {
  list(projectId: string): Promise<ChatThread[]>;
  get(threadId: string): Promise<ChatThread>;
  create(projectId: string, model: string): Promise<ChatThread>;
  update(
    threadId: string,
    input: { title?: string; model?: string; contextSources?: ChatContextSource[] },
  ): Promise<ChatThread>;
  remove(threadId: string): Promise<void>;
  send(
    threadId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  regenerate(
    threadId: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  stop(threadId: string): Promise<void>;
};

export type ArchivesClient = {
  exportProject(projectId: string, options: ManuscriptExportOptions): Promise<void>;
  importProject(): Promise<ImportedProject | null>;
};

export type SkrivClient = {
  capabilities: PlatformCapabilities;
  projects: ProjectsClient;
  manuscript: ManuscriptClient;
  notes: NotesClient;
  compendium: CompendiumClient;
  ideation: IdeationClient;
  prompts: PromptsClient;
  settings: SettingsClient;
  backups: BackupsClient | null;
  generation: GenerationClient;
  chat: ChatClient;
  archives: ArchivesClient;
};

type StreamingAdapters = {
  generation(
    input: GenerationRequest,
    onEvent: (event: GenerationStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  chat(
    path: string,
    content: string | null,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
};

function request<T>(
  transport: RequestTransport,
  path: string,
  method: ClientRequest["method"] = "GET",
  input?: unknown,
): Promise<T> {
  return transport.request<T>(path, {
    method,
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}

export function createSkrivClient(
  transport: RequestTransport,
  streams: StreamingAdapters,
  archives: ArchivesClient,
  capabilities: PlatformCapabilities,
  backups: BackupsClient | null,
): SkrivClient {
  return {
    capabilities,
    projects: {
      list: () => request(transport, "/api/projects"),
      create: (input) => request(transport, "/api/projects", "POST", input),
      update: (id, input) => request(transport, `/api/projects/${id}`, "PATCH", input),
      remove: (id) => request(transport, `/api/projects/${id}`, "DELETE"),
      tree: (id) => request(transport, `/api/projects/${id}/tree`),
      defaults: () => request(transport, "/api/project-defaults"),
      updateDefaults: (input) => request(transport, "/api/project-defaults", "PUT", input),
    },
    manuscript: {
      scene: (id) => request(transport, `/api/scenes/${id}`),
      updateScene: (id, input) => request(transport, `/api/scenes/${id}`, "PATCH", input),
      revisions: (id) => request(transport, `/api/scenes/${id}/revisions`),
      restoreRevision: (sceneId, revisionId) =>
        request(transport, `/api/scenes/${sceneId}/revisions/${revisionId}/restore`, "POST"),
      createItem: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/manuscript-items`, "POST", input),
      updateItem: (kind, id, input) => request(transport, `/api/${kind}s/${id}`, "PATCH", input),
      removeItem: (kind, id) => request(transport, `/api/${kind}s/${id}`, "DELETE"),
      reorderActs: (projectId, orderedIds) =>
        request(transport, `/api/projects/${projectId}/acts/reorder`, "POST", { orderedIds }),
      reorderChapters: (actId, orderedIds) =>
        request(transport, `/api/acts/${actId}/chapters/reorder`, "POST", { orderedIds }),
      reorderScenes: (chapterId, orderedIds) =>
        request(transport, `/api/chapters/${chapterId}/scenes/reorder`, "POST", { orderedIds }),
      generateSummary: (sceneId, input) =>
        request(transport, `/api/scenes/${sceneId}/summary/generate`, "POST", input),
    },
    notes: {
      list: (projectId) => request(transport, `/api/projects/${projectId}/notes`),
      get: (id) => request(transport, `/api/notes/${id}`),
      create: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/notes`, "POST", input),
      update: (id, input) => request(transport, `/api/notes/${id}`, "PATCH", input),
      remove: (id) => request(transport, `/api/notes/${id}`, "DELETE"),
    },
    compendium: {
      list: (projectId) => request(transport, `/api/projects/${projectId}/compendium`),
      categories: (projectId) =>
        request(transport, `/api/projects/${projectId}/compendium-categories`),
      create: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/compendium`, "POST", input),
      update: (id, input) => request(transport, `/api/compendium/${id}`, "PATCH", input),
      remove: (id) => request(transport, `/api/compendium/${id}`, "DELETE"),
      createCategory: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/compendium-categories`, "POST", input),
      updateCategory: (id, input) =>
        request(transport, `/api/compendium-categories/${id}`, "PATCH", input),
      removeCategory: (id) => request(transport, `/api/compendium-categories/${id}`, "DELETE"),
    },
    ideation: {
      definitions: () => request(transport, "/api/ideation/definitions"),
      createDefinition: (input) => request(transport, "/api/ideation/definitions", "POST", input),
      metadata: (projectId) => request(transport, `/api/projects/${projectId}/ideation`),
      updateMetadata: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/ideation`, "PATCH", input),
      generate: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/ideation/generate`, "POST", input),
      projectPacks: (projectId) =>
        request(transport, `/api/projects/${projectId}/ingredient-packs`),
      syncProjectPacks: (projectId, ingredientPackIds) =>
        request(transport, `/api/projects/${projectId}/ingredient-packs`, "PUT", {
          ingredientPackIds,
        }),
      extractCompendium: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/ideation/extract-compendium`, "POST", input),
      importCompendium: (projectId, input) =>
        request(transport, `/api/projects/${projectId}/ideation/import-compendium`, "POST", input),
      catalog: () => request(transport, "/api/ingredient-pack-catalog"),
      createCatalogNode: (kind, input) =>
        request(transport, `/api/ingredient-pack-${kind}`, "POST", input),
      updateCatalogNode: (kind, id, input) =>
        request(transport, `/api/ingredient-pack-${kind}/${id}`, "PATCH", input),
      removeCatalogNode: (kind, id) =>
        request(transport, `/api/ingredient-pack-${kind}/${id}`, "DELETE"),
      createPack: (input) => request(transport, "/api/ingredient-packs", "POST", input),
      updatePack: (id, input) => request(transport, `/api/ingredient-packs/${id}`, "PATCH", input),
      removePack: (id) => request(transport, `/api/ingredient-packs/${id}`, "DELETE"),
    },
    prompts: {
      list: () => request(transport, "/api/prompts"),
      copy: (id) => request(transport, `/api/prompts/${id}/copy`, "POST"),
      create: (input) => request(transport, "/api/prompts", "POST", input),
      update: (id, input) => request(transport, `/api/prompts/${id}`, "PATCH", input),
      remove: (id) => request(transport, `/api/prompts/${id}`, "DELETE"),
      bind: (workflow, promptId) =>
        request(transport, "/api/prompt-bindings", "PUT", { workflow, promptId }),
    },
    settings: {
      app: () => request(transport, "/api/settings/app"),
      updateApp: (input) => request(transport, "/api/settings/app", "PATCH", input),
      ai: () => request(transport, "/api/settings/ai"),
      updateAi: (input) => request(transport, "/api/settings/ai", "PATCH", input),
      editor: () => request(transport, "/api/settings/editor"),
      updateEditor: (input) => request(transport, "/api/settings/editor", "PATCH", input),
      models: () => request(transport, "/api/models"),
      credential: () => request(transport, "/api/settings/openrouter"),
      saveCredential: (apiKey) => request(transport, "/api/settings/openrouter", "PUT", { apiKey }),
      deleteCredential: () => request(transport, "/api/settings/openrouter", "DELETE"),
    },
    backups,
    generation: {
      start: streams.generation,
      accept: (id, input) => request(transport, `/api/generations/${id}/accept`, "POST", input),
      reject: (id) => request(transport, `/api/generations/${id}/reject`, "POST"),
      cancel: (id, input) => request(transport, `/api/generations/${id}/cancel`, "POST", input),
    },
    chat: {
      list: (projectId) => request(transport, `/api/projects/${projectId}/chat/threads`),
      get: (id) => request(transport, `/api/chat/threads/${id}`),
      create: (projectId, model) =>
        request(transport, `/api/projects/${projectId}/chat/threads`, "POST", { model }),
      update: (id, input) => request(transport, `/api/chat/threads/${id}`, "PATCH", input),
      remove: (id) => request(transport, `/api/chat/threads/${id}`, "DELETE"),
      send: (id, content, onEvent, signal) =>
        streams.chat(`/api/chat/threads/${id}/messages`, content, onEvent, signal),
      regenerate: (id, onEvent, signal) =>
        streams.chat(`/api/chat/threads/${id}/regenerate`, null, onEvent, signal),
      stop: (id) => request(transport, `/api/chat/threads/${id}/stop`, "POST"),
    },
    archives,
  };
}

let configuredClient: SkrivClient | null = null;

export function configureSkrivClient(client: SkrivClient): void {
  configuredClient = client;
}

export function getSkrivClient(): SkrivClient {
  if (!configuredClient)
    throw new AppError("The application client has not been configured.", "INTERNAL_ERROR");
  return configuredClient;
}
