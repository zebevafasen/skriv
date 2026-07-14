import {
  type CompendiumCategory,
  type CompendiumEntry,
  type ContentPackage,
  type ManuscriptTree,
  type Project,
  type ProjectDefaults,
  storyLanguages,
  type IngredientPackCatalog,
} from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Plus, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";
import { IngredientPackPicker } from "../components/IngredientPackPicker.js";
import { IngredientPackCatalogManager } from "../components/IngredientPackCatalogManager.js";

type DefinitionsResponse = {
  package: ContentPackage;
  customDefinitions: Array<{ id: string; kind: "genre" | "theme" | "tag"; label: string }>;
};

type CreatedProject = { project: Project; initialSceneId: string };

export function projectArtworkVariant(projectId: string, variants = 9) {
  let hash = 0x811c9dc5;
  for (const character of projectId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0) % variants;
}

export function projectArtworkHue(projectId: string) {
  let hash = 0x517cc1b7;
  for (const character of projectId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0) % 360;
}

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState<ProjectDefaults["language"]>("General English");
  const [advanced, setAdvanced] = useState(false);
  const [outlineChoice, setOutlineChoice] = useState("blank");
  const [copyProjectId, setCopyProjectId] = useState("");
  const [copyEntryIds, setCopyEntryIds] = useState<string[]>([]);
  const [ingredientPackIds, setIngredientPackIds] = useState<string[]>([]);
  const [ingredientPackManagerOpen, setIngredientPackManagerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultsInitialized = useRef(false);
  const authorTouched = useRef(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/api/projects"),
  });
  const defaults = useQuery({
    queryKey: ["project-defaults"],
    queryFn: () => api<ProjectDefaults>("/api/project-defaults"),
  });
  const ingredientPackCatalog = useQuery({
    queryKey: ["ingredient-pack-catalog"],
    queryFn: () => api<IngredientPackCatalog>("/api/ingredient-pack-catalog"),
  });
  const definitions = useQuery({
    queryKey: ["ideation-definitions"],
    queryFn: () => api<DefinitionsResponse>("/api/ideation/definitions"),
  });
  const sourceEntries = useQuery({
    queryKey: ["compendium", copyProjectId],
    queryFn: () => api<CompendiumEntry[]>(`/api/projects/${copyProjectId}/compendium`),
    enabled: Boolean(copyProjectId),
  });
  const sourceCategories = useQuery({
    queryKey: ["compendium-categories", copyProjectId],
    queryFn: () =>
      api<CompendiumCategory[]>(`/api/projects/${copyProjectId}/compendium-categories`),
    enabled: Boolean(copyProjectId),
  });
  const sourceTree = useQuery({
    queryKey: ["project-tree", copyProjectId],
    queryFn: () => api<ManuscriptTree>(`/api/projects/${copyProjectId}/tree`),
    enabled: Boolean(copyProjectId) && outlineChoice === "copy",
  });
  useEffect(() => {
    if (!defaults.data || defaultsInitialized.current) return;
    defaultsInitialized.current = true;
    if (!authorTouched.current) setAuthor(defaults.data.author);
    setLanguage(defaults.data.language);
  }, [defaults.data]);
  const persistDefaults = async (
    nextAuthor = author,
    nextLanguage: ProjectDefaults["language"] = language,
  ) => {
    if (
      defaults.data &&
      nextAuthor === defaults.data.author &&
      nextLanguage === defaults.data.language
    )
      return;
    const saved = await api<ProjectDefaults>("/api/project-defaults", {
      method: "PUT",
      body: JSON.stringify({ author: nextAuthor, language: nextLanguage }),
    });
    client.setQueryData(["project-defaults"], saved);
  };
  const createProject = useMutation({
    mutationFn: async () => {
      await persistDefaults();
      return api<CreatedProject>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          author,
          language,
          ingredientPackIds,
          outline:
            outlineChoice === "copy"
              ? { kind: "project", projectId: copyProjectId }
              : outlineChoice === "blank"
                ? { kind: "blank" }
                : { kind: "preset", presetId: outlineChoice },
          compendiumCopy:
            copyProjectId && copyEntryIds.length
              ? { sourceProjectId: copyProjectId, entryIds: copyEntryIds }
              : null,
        }),
      });
    },
    onSuccess: async ({ project }) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });
  const importProject = useMutation({
    mutationFn: (jsonString: string) =>
      api<CreatedProject>("/api/projects/import", {
        method: "POST",
        body: jsonString,
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: async ({ project }) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });

  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === "string") {
          importProject.mutate(text);
        }
      } catch (err) {
        console.error("Failed to parse imported project", err);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  const filtered = useMemo(
    () =>
      (projects.data ?? []).filter((project) =>
        project.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [projects.data, query],
  );
  const copyableEntries = (sourceEntries.data ?? []).filter((entry) => !entry.singleton);
  const customCategoryNames = new Map(
    (sourceCategories.data ?? []).map((category) => [`custom.${category.id}`, category.name]),
  );
  const standardNames: Record<string, string> = {
    "story.character": "Characters",
    "story.location": "Locations",
    "story.object": "Objects",
    "story.faction": "Factions",
    "story.lore": "Lore",
    "story.other": "Other",
  };
  const entryGroups = [...new Set(copyableEntries.map((entry) => entry.typeId))].map((typeId) => ({
    typeId,
    name: standardNames[typeId] ?? customCategoryNames.get(typeId) ?? "Custom",
    entries: copyableEntries.filter((entry) => entry.typeId === typeId),
  }));

  return (
    <div className="page library-page">
      <section className="page-heading">
        <p className="eyebrow">Your private library</p>
        <h1>Your stories</h1>
        <p>Every world begins somewhere. Continue a manuscript or begin weaving something new.</p>
      </section>
      <div className="library-actions">
        <button type="button" className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> Create story
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={importProject.isPending}
        >
          <Upload size={18} /> {importProject.isPending ? "Importing..." : "Import story"}
        </button>
        <input
          type="file"
          accept=".json"
          style={{ display: "none" }}
          ref={fileInputRef}
          onChange={handleImportChange}
        />
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your stories…"
          />
        </label>
      </div>
      {projects.error ? <ErrorNotice error={projects.error} /> : null}
      {importProject.error ? <ErrorNotice error={importProject.error} /> : null}
      {projects.isLoading ? <div className="loading">Gathering your stories…</div> : null}
      {!projects.isLoading && filtered.length === 0 ? (
        <EmptyState
          title="A blank shelf"
          body="Create your first story and Asterism will prepare its opening scene."
        />
      ) : null}
      <section className="project-grid" aria-label="Projects">
        {filtered.map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="project-card"
          >
            <div
              className={`project-art art-${projectArtworkVariant(project.id)}`}
              style={{ "--art-hue": projectArtworkHue(project.id) } as React.CSSProperties}
            >
            </div>
            <div className="project-card-body">
              <h2>{project.title}</h2>
              <p>
                <BookOpen size={14} /> Edited {new Date(project.updatedAt).toLocaleDateString()}
              </p>
              <span>
                Open manuscript <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </section>
      {creating ? (
        <div className="modal-backdrop">
          <form
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (newTitle.trim() && (outlineChoice !== "copy" || copyProjectId))
                createProject.mutate();
            }}
          >
            <p className="eyebrow">New project</p>
            <h2>Create your story</h2>
            <div className="new-project-fields">
              <label>
                <span>Title</span>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="The Last Ember"
                />
              </label>
              <label>
                <span>Author / pen name</span>
                <input
                  value={author}
                  onChange={(event) => {
                    authorTouched.current = true;
                    setAuthor(event.target.value);
                  }}
                  onBlur={() => void persistDefaults()}
                  placeholder="Your name"
                />
              </label>
              <label>
                <span>Series</span>
                <select disabled>
                  <option>Coming soon</option>
                </select>
              </label>
              <label>
                <span>Story language</span>
                <select
                  value={language}
                  onChange={(event) => {
                    const next = event.target.value as ProjectDefaults["language"];
                    setLanguage(next);
                    void persistDefaults(author, next);
                  }}
                >
                  {storyLanguages.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="button ghost advanced-toggle"
              onClick={() => setAdvanced((value) => !value)}
            >
              {advanced ? "Hide advanced setup" : "Show advanced setup"}
            </button>
            {advanced ? (
              <div className="new-project-advanced">
                <section>
                  <h3>Outline layout</h3>
                  <select
                    value={outlineChoice}
                    onChange={(event) => setOutlineChoice(event.target.value)}
                  >
                    <option value="blank">Blank</option>
                    <option value="three-act">Three-Act Structure</option>
                    <option value="save-the-cat">Save the Cat</option>
                    <option value="copy">Copy layout from a project</option>
                  </select>
                  {outlineChoice === "copy" && copyProjectId && sourceTree.data ? (
                    <p className="hint">
                      Copies {sourceTree.data.acts.length} Acts and{" "}
                      {
                        sourceTree.data.acts
                          .flatMap((act) => act.chapters)
                          .flatMap((chapter) => chapter.scenes).length
                      }{" "}
                      empty Scenes.
                    </p>
                  ) : null}
                </section>
                <section>
                  <h3>Ingredient packs</h3>
                  {ingredientPackCatalog.error ? <ErrorNotice error={ingredientPackCatalog.error} /> : <IngredientPackPicker
                    catalog={ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }}
                    selectedIds={new Set(ingredientPackIds)}
                    definitions={[
                      ...(definitions.data?.package.genres.map((item) => ({ ...item, kind: "genre" as const })) ?? []),
                      ...(definitions.data?.package.themes.map((item) => ({ ...item, kind: "theme" as const })) ?? []),
                      ...(definitions.data?.package.tags.map((item) => ({ ...item, kind: "tag" as const })) ?? []),
                      ...(definitions.data?.customDefinitions ?? []),
                    ]}
                    onSelectionChange={setIngredientPackIds}
                    onManage={() => setIngredientPackManagerOpen(true)}
                  />}
                </section>
                <section>
                  <h3>Copy from another project</h3>
                  <select
                    value={copyProjectId}
                    onChange={(event) => {
                      setCopyProjectId(event.target.value);
                      setCopyEntryIds([]);
                    }}
                  >
                    <option value="">Choose a project…</option>
                    {projects.data?.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                  {copyProjectId ? (
                    <div className="compendium-copy-list">
                      <label className="copy-all">
                        <input
                          type="checkbox"
                          checked={
                            copyableEntries.length > 0 &&
                            copyEntryIds.length === copyableEntries.length
                          }
                          onChange={() =>
                            setCopyEntryIds(
                              copyEntryIds.length === copyableEntries.length
                                ? []
                                : copyableEntries.map((entry) => entry.id),
                            )
                          }
                        />{" "}
                        All Compendium entries
                      </label>
                      {entryGroups.map((group) => (
                        <div key={group.typeId}>
                          <label className="copy-category">
                            <input
                              type="checkbox"
                              checked={
                                group.entries.length > 0 &&
                                group.entries.every((entry) => copyEntryIds.includes(entry.id))
                              }
                              onChange={() =>
                                setCopyEntryIds((current) =>
                                  group.entries.every((entry) => current.includes(entry.id))
                                    ? current.filter(
                                        (id) => !group.entries.some((entry) => entry.id === id),
                                      )
                                    : [
                                        ...new Set([
                                          ...current,
                                          ...group.entries.map((entry) => entry.id),
                                        ]),
                                      ],
                                )
                              }
                            />{" "}
                            {group.name}
                          </label>
                          {group.entries.map((entry) => (
                            <label key={entry.id}>
                              <input
                                type="checkbox"
                                checked={copyEntryIds.includes(entry.id)}
                                onChange={() =>
                                  setCopyEntryIds((current) =>
                                    current.includes(entry.id)
                                      ? current.filter((id) => id !== entry.id)
                                      : [...current, entry.id],
                                  )
                                }
                              />{" "}
                              {entry.name}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
            {createProject.error ? <ErrorNotice error={createProject.error} /> : null}
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  !newTitle.trim() ||
                  createProject.isPending ||
                  (outlineChoice === "copy" && !copyProjectId)
                }
              >
                Create project
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <IngredientPackCatalogManager
        open={ingredientPackManagerOpen}
        catalog={ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }}
        definitions={[
          ...(definitions.data?.package.genres.map((item) => ({ ...item, kind: "genre" as const })) ?? []),
          ...(definitions.data?.package.themes.map((item) => ({ ...item, kind: "theme" as const })) ?? []),
          ...(definitions.data?.package.tags.map((item) => ({ ...item, kind: "tag" as const })) ?? []),
          ...(definitions.data?.customDefinitions ?? []),
        ]}
        onClose={() => setIngredientPackManagerOpen(false)}
        onChanged={async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey: ["ingredient-pack-catalog"] }),
            client.invalidateQueries({ queryKey: ["ideation-definitions"] }),
          ]);
        }}
      />
    </div>
  );
}
