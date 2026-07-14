import {
  type ContentPackage,
  type Project,
  type ProjectDefaults,
  storyLanguages,
} from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Plus, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { asterism } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";
import { IngredientPackPicker } from "../components/IngredientPackPicker.js";
import { IngredientPackCatalogManager } from "../components/IngredientPackCatalogManager.js";

type DefinitionsResponse = {
  package: ContentPackage;
  customDefinitions: Array<{ id: string; kind: "genre" | "theme" | "tag"; label: string }>;
};

type CreatedProject = { project: Project; initialSceneId: string | null };

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

export function projectArtworkSeed(project: Pick<Project, "id" | "settings">) {
  return project.settings.coverArtworkSeed || project.id;
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
  const defaultsInitialized = useRef(false);
  const authorTouched = useRef(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => asterism().projects.list(),
  });
  const defaults = useQuery({
    queryKey: ["project-defaults"],
    queryFn: () => asterism().projects.defaults(),
  });
  const ingredientPackCatalog = useQuery({
    queryKey: ["ingredient-pack-catalog"],
    queryFn: () => asterism().ideation.catalog(),
  });
  const definitions = useQuery({
    queryKey: ["ideation-definitions"],
    queryFn: () => asterism().ideation.definitions() as Promise<DefinitionsResponse>,
  });
  const sourceEntries = useQuery({
    queryKey: ["compendium", copyProjectId],
    queryFn: () => asterism().compendium.list(copyProjectId),
    enabled: Boolean(copyProjectId),
  });
  const sourceCategories = useQuery({
    queryKey: ["compendium-categories", copyProjectId],
    queryFn: () => asterism().compendium.categories(copyProjectId),
    enabled: Boolean(copyProjectId),
  });
  const sourceTree = useQuery({
    queryKey: ["project-tree", copyProjectId],
    queryFn: () => asterism().projects.tree(copyProjectId),
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
    const saved = await asterism().projects.updateDefaults({
      author: nextAuthor,
      language: nextLanguage,
    });
    client.setQueryData(["project-defaults"], saved);
  };
  const createProject = useMutation({
    mutationFn: async () => {
      await persistDefaults();
      return asterism().projects.create({
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
      }) as Promise<CreatedProject>;
    },
    onSuccess: async ({ project }) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });
  const importProject = useMutation({
    mutationFn: () => asterism().archives.importProject(),
    onSuccess: async (result) => {
      if (!result) return;
      await client.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: result.project.id } });
    },
  });
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
          onClick={() => importProject.mutate()}
          disabled={importProject.isPending}
        >
          <Upload size={18} /> {importProject.isPending ? "Importing..." : "Import story"}
        </button>
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
        {filtered.map((project) => {
          const artworkSeed = projectArtworkSeed(project);
          return (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="project-card"
            >
              <div
                className={`project-art art-${projectArtworkVariant(artworkSeed)}`}
                style={{ "--art-hue": projectArtworkHue(artworkSeed) } as React.CSSProperties}
              >
                {project.settings.coverDataUrl ? (
                  <img src={project.settings.coverDataUrl} alt="" />
                ) : null}
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
          );
        })}
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
                  {ingredientPackCatalog.error ? (
                    <ErrorNotice error={ingredientPackCatalog.error} />
                  ) : (
                    <IngredientPackPicker
                      catalog={
                        ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }
                      }
                      selectedIds={new Set(ingredientPackIds)}
                      definitions={[
                        ...(definitions.data?.package.genres.map((item) => ({
                          ...item,
                          kind: "genre" as const,
                        })) ?? []),
                        ...(definitions.data?.package.themes.map((item) => ({
                          ...item,
                          kind: "theme" as const,
                        })) ?? []),
                        ...(definitions.data?.package.tags.map((item) => ({
                          ...item,
                          kind: "tag" as const,
                        })) ?? []),
                        ...(definitions.data?.customDefinitions ?? []),
                      ]}
                      onSelectionChange={setIngredientPackIds}
                      onManage={() => setIngredientPackManagerOpen(true)}
                    />
                  )}
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
          ...(definitions.data?.package.genres.map((item) => ({
            ...item,
            kind: "genre" as const,
          })) ?? []),
          ...(definitions.data?.package.themes.map((item) => ({
            ...item,
            kind: "theme" as const,
          })) ?? []),
          ...(definitions.data?.package.tags.map((item) => ({ ...item, kind: "tag" as const })) ??
            []),
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
