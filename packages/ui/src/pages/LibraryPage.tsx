import { type Project, type ProjectDefaults, storyLanguages } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  LayoutGrid,
  List,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { asterism } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";
import { readProjectAccessHistory } from "../utils/projectAccess.js";
import {
  projectArtworkHue,
  projectArtworkSecondaryHue,
  projectArtworkSeed,
  projectArtworkVariant,
  projectArtworkVariants,
} from "../utils/projectArtwork.js";
import {
  filterAndSortProjects,
  type ProjectSortDirection,
  type ProjectSortField,
} from "../utils/projectLibrary.js";

type CreatedProject = { project: Project; initialSceneId: string | null };
type LibraryView = "grid" | "list";

function formatRelativeTime(value: string): string {
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1_000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(elapsedSeconds) >= seconds)
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
  }
  return "just now";
}

function directionLabel(field: ProjectSortField, direction: ProjectSortDirection): string {
  if (field === "date") return direction === "ascending" ? "Oldest first" : "Recent first";
  return direction === "ascending" ? "A–Z" : "Z–A";
}

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<ProjectSortField>("date");
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>("descending");
  const [libraryView, setLibraryView] = useState<LibraryView>("grid");
  const [accessHistory] = useState(readProjectAccessHistory);
  const [newTitle, setNewTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState<ProjectDefaults["language"]>("General English");
  const [advanced, setAdvanced] = useState(false);
  const [outlineChoice, setOutlineChoice] = useState("blank");
  const [copyProjectId, setCopyProjectId] = useState("");
  const [copyEntryIds, setCopyEntryIds] = useState<string[]>([]);
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
    () => filterAndSortProjects(projects.data ?? [], query, sortField, sortDirection),
    [projects.data, query, sortDirection, sortField],
  );
  const recentProjects = useMemo(
    () =>
      (projects.data ?? [])
        .flatMap((project) => {
          const lastOpenedAt = accessHistory[project.id];
          return lastOpenedAt ? [{ project, lastOpenedAt }] : [];
        })
        .sort(
          (left, right) =>
            new Date(right.lastOpenedAt).getTime() - new Date(left.lastOpenedAt).getTime(),
        )
        .slice(0, 3),
    [accessHistory, projects.data],
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
        <h1>Your Library</h1>
      </section>
      {recentProjects.length ? (
        <section className="recent-projects" aria-labelledby="recent-projects-title">
          <div className="library-section-heading">
            <h2 className="eyebrow" id="recent-projects-title">
              Jump back in
            </h2>
          </div>
          <div className="recent-project-grid">
            {recentProjects.map(({ project, lastOpenedAt }) => (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="recent-project-card"
              >
                <div>
                  <h3>{project.title}</h3>
                  <p>{project.settings?.author || "Unknown author"}</p>
                </div>
                <span title={new Date(lastOpenedAt).toLocaleString()}>
                  Last used {formatRelativeTime(lastOpenedAt)}
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <div className="library-section-heading projects-heading">
        <h2 className="eyebrow">Collection</h2>
        {!projects.isLoading ? (
          <span>
            {projects.data?.length ?? 0} {(projects.data?.length ?? 0) === 1 ? "story" : "stories"}
          </span>
        ) : null}
      </div>
      <div className="library-actions">
        <div className="library-action-buttons">
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
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, author or series…"
            aria-label="Search projects by title, author or series"
          />
        </label>
      </div>
      <div className="library-controls">
        <label className="sort-control">
          <span>Sort by</span>
          <select
            value={sortField}
            onChange={(event) => {
              const nextField = event.target.value as ProjectSortField;
              setSortField(nextField);
              setSortDirection(nextField === "date" ? "descending" : "ascending");
            }}
          >
            <option value="date">Last modified</option>
            <option value="name">Name</option>
            <option value="series" disabled>
              Series (coming soon)
            </option>
            <option value="author">Author</option>
          </select>
        </label>
        <button
          type="button"
          className="sort-direction-button"
          onClick={() =>
            setSortDirection((current) => (current === "ascending" ? "descending" : "ascending"))
          }
          aria-label={`Current order: ${directionLabel(sortField, sortDirection)}. Change sort direction`}
          title={`Current order: ${directionLabel(sortField, sortDirection)}`}
        >
          {sortDirection === "ascending" ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
          {directionLabel(sortField, sortDirection)}
        </button>
        <fieldset className="view-control">
          <legend>View as</legend>
          <div className="view-toggle">
            <button
              type="button"
              className={libraryView === "grid" ? "active" : ""}
              aria-label="Grid view"
              aria-pressed={libraryView === "grid"}
              onClick={() => setLibraryView("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              type="button"
              className={libraryView === "list" ? "active" : ""}
              aria-label="List view"
              aria-pressed={libraryView === "list"}
              onClick={() => setLibraryView("list")}
            >
              <List size={18} />
            </button>
          </div>
        </fieldset>
      </div>
      {projects.error ? <ErrorNotice error={projects.error} /> : null}
      {importProject.error ? <ErrorNotice error={importProject.error} /> : null}
      {projects.isLoading ? <div className="loading">Gathering your stories…</div> : null}
      {!projects.isLoading && filtered.length === 0 && !query.trim() ? (
        <EmptyState
          title="A blank shelf"
          body="Create your first story and Asterism will prepare its opening scene."
        />
      ) : null}
      {!projects.isLoading && filtered.length === 0 && query.trim() ? (
        <EmptyState title="No stories found" body="Try a different title, author, or series." />
      ) : null}
      <section className={`project-grid ${libraryView}-view`} aria-label="Projects">
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
                className="project-art"
                style={
                  {
                    "--art-hue": projectArtworkHue(artworkSeed),
                    "--art-secondary-hue": projectArtworkSecondaryHue(artworkSeed),
                    ...projectArtworkVariants[projectArtworkVariant(artworkSeed)],
                  } as React.CSSProperties
                }
              >
                {project.settings.coverDataUrl ? (
                  <img src={project.settings.coverDataUrl} alt="" />
                ) : null}
              </div>
              <div className="project-card-body">
                <h2>{project.title}</h2>
                <p className="project-byline">{project.settings?.author || "Unknown author"}</p>
                {project.settings?.series ? (
                  <p className="project-series">{project.settings.series}</p>
                ) : null}
                <p className="project-modified">
                  <BookOpen size={14} /> Modified {new Date(project.updatedAt).toLocaleDateString()}
                </p>
                <span>
                  Open Project <ArrowRight size={14} />
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
    </div>
  );
}
