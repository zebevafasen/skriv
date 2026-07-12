import type { AiSettings, CompendiumEntry, ManuscriptTree } from "@asterism/contracts";
import { findMentions, manuscriptLabels } from "@asterism/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  BookMarked,
  BookOpenText,
  Check,
  ChevronDown,
  Download,
  FileText,
  Layers3,
  Library,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Settings,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api.js";
import { ErrorNotice } from "../components/AppShell.js";
import { CompendiumEntryDrawer, CompendiumPanel } from "../components/CompendiumPanel.js";
import { useAppDialog } from "../components/DialogProvider.js";
import { ExportDialog } from "../components/ExportDialog.js";
import type { ManuscriptEditorHandle } from "../components/ManuscriptEditor.js";
import { type ManuscriptScope, scenesForScope } from "../editor/manuscriptDocument.js";
import { trapFocusWithin } from "../utils/focus.js";
import { updateSceneInTree } from "../utils/manuscript.js";

const ChatPanel = lazy(() =>
  import("../components/ChatPanel.js").then((module) => ({ default: module.ChatPanel })),
);
const IdeationPanel = lazy(() =>
  import("../components/IdeationPanel.js").then((module) => ({ default: module.IdeationPanel })),
);
const ManuscriptEditor = lazy(() =>
  import("../components/ManuscriptEditor.js").then((module) => ({
    default: module.ManuscriptEditor,
  })),
);
const OutlineGrid = lazy(() =>
  import("../components/OutlineGrid.js").then((module) => ({ default: module.OutlineGrid })),
);
const ProjectNotesPanel = lazy(() =>
  import("../components/ProjectNotesPanel.js").then((module) => ({
    default: module.ProjectNotesPanel,
  })),
);
const ProjectSettingsPanel = lazy(() =>
  import("../components/ProjectSettingsPanel.js").then((module) => ({
    default: module.ProjectSettingsPanel,
  })),
);

type Tab = "manuscript" | "compendium" | "ideation" | "chat" | "settings";
type ManuscriptView = "write" | "outline" | "notes";
type Model = { id: string; name: string };

function DeferredWorkspace({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Suspense fallback={<div className="loading-state">Loading {name}…</div>}>{children}</Suspense>
  );
}

function scopeValue(scope: ManuscriptScope): string {
  return `${scope.kind}:${"id" in scope ? scope.id : "all"}`;
}

function parseScope(value: string | undefined): ManuscriptScope {
  if (!value || value === "story") return { kind: "story" };
  const [kind, id] = value.split(":");
  if (id && (kind === "act" || kind === "chapter" || kind === "scene")) return { kind, id };
  return { kind: "story" };
}

function countWords(value: string): number {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

export function ProjectPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const search = useSearch({ from: "/projects/$projectId" });
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const client = useQueryClient();
  const dialog = useAppDialog();
  const tab: Tab = search.tab ?? "manuscript";
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const moreCloseRef = useRef<HTMLButtonElement>(null);
  const scopePickerRef = useRef<HTMLDivElement>(null);
  const [compendiumOpen, setCompendiumOpen] = useState(
    () => !window.matchMedia("(max-width: 900px)").matches,
  );
  const view: ManuscriptView = search.view ?? "write";
  const scope = parseScope(search.scope);
  const selectedEntryId = search.entry ?? null;

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      document.documentElement.style.setProperty(
        "--visual-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--visual-viewport-offset-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      document.documentElement.style.removeProperty("--visual-viewport-height");
      document.documentElement.style.removeProperty("--visual-viewport-offset-top");
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    requestAnimationFrame(() => moreCloseRef.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setScopeMenuOpen(false);
        return;
      }
      if (!scopePickerRef.current?.contains(event.target as Node)) setScopeMenuOpen(false);
    };
    requestAnimationFrame(() =>
      scopePickerRef.current
        ?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')
        ?.focus(),
    );
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [scopeMenuOpen]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 900px)");
    const handleViewportChange = (event: MediaQueryListEvent) => setCompendiumOpen(!event.matches);
    mobileQuery.addEventListener("change", handleViewportChange);
    return () => mobileQuery.removeEventListener("change", handleViewportChange);
  }, []);
  useEffect(() => {
    if (
      (tab === "chat" || tab === "compendium") &&
      window.matchMedia("(max-width: 900px)").matches
    ) {
      setCompendiumOpen(false);
    }
  }, [tab]);
  const [previewEntryIds, setPreviewEntryIds] = useState<string[]>([]);
  const editorRef = useRef<ManuscriptEditorHandle | null>(null);
  const tree = useQuery({
    queryKey: ["project-tree", projectId],
    queryFn: () => api<ManuscriptTree>(`/api/projects/${projectId}/tree`),
  });
  const compendium = useQuery({
    queryKey: ["compendium", projectId],
    queryFn: () => api<CompendiumEntry[]>(`/api/projects/${projectId}/compendium`),
  });
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api<AiSettings>("/api/settings/ai"),
  });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api<Model[]>("/api/models") });
  const allScenes = useMemo(
    () => tree.data?.acts.flatMap((act) => act.chapters.flatMap((chapter) => chapter.scenes)) ?? [],
    [tree.data],
  );
  const structureLabels = useMemo(
    () => (tree.data ? manuscriptLabels(tree.data) : null),
    [tree.data],
  );
  const selectedSceneId =
    allScenes.find((scene) => scene.id === search.scene)?.id ?? allScenes[0]?.id ?? null;

  const updateSearch = useCallback(
    (
      changes: Partial<{
        tab: Tab | undefined;
        view: ManuscriptView | undefined;
        scope: string | undefined;
        scene: string | undefined;
        thread: string | undefined;
        entry: string | undefined;
      }>,
      replace = false,
    ) =>
      navigate({
        search: (previous) => {
          const next = { ...previous };
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === "manuscript" || value === "write")
              delete next[key as keyof typeof next];
            else Object.assign(next, { [key]: value });
          }
          return next;
        },
        replace,
      }),
    [navigate],
  );

  useEffect(() => {
    const sceneValid = !search.scene || allScenes.some((scene) => scene.id === search.scene);
    const entryValid =
      !search.entry || (compendium.data ?? []).some((entry) => entry.id === search.entry);
    const routeScope = parseScope(search.scope);
    const scopeValid =
      routeScope.kind === "story" ||
      (routeScope.kind === "act" && tree.data?.acts.some((act) => act.id === routeScope.id)) ||
      (routeScope.kind === "chapter" &&
        tree.data?.acts.some((act) =>
          act.chapters.some((chapter) => chapter.id === routeScope.id),
        )) ||
      (routeScope.kind === "scene" && allScenes.some((scene) => scene.id === routeScope.id));
    if (!sceneValid || !entryValid || !scopeValid)
      void updateSearch(
        {
          ...(!sceneValid ? { scene: undefined } : {}),
          ...(!entryValid ? { entry: undefined } : {}),
          ...(!scopeValid ? { scope: undefined } : {}),
        },
        true,
      );
  }, [
    allScenes,
    compendium.data,
    search.entry,
    search.scene,
    search.scope,
    tree.data,
    updateSearch,
  ]);

  const selectedEntryMentionCount = useMemo(() => {
    if (!selectedEntryId) return 0;
    return allScenes.reduce(
      (total, scene) =>
        total +
        findMentions(scene.plainText, compendium.data ?? []).filter((match) =>
          match.entryIds.includes(selectedEntryId),
        ).length,
      0,
    );
  }, [allScenes, compendium.data, selectedEntryId]);

  const selectedLocation = useMemo(() => {
    for (const act of tree.data?.acts ?? []) {
      for (const chapter of act.chapters) {
        const scene = chapter.scenes.find((candidate) => candidate.id === selectedSceneId);
        if (scene) return { act, chapter, scene };
      }
    }
    return null;
  }, [selectedSceneId, tree.data]);

  const scopedScenes = useMemo(
    () => (tree.data ? scenesForScope(tree.data, scope) : []),
    [scope, tree.data],
  );
  const scopedWordCount = useMemo(
    () => scopedScenes.reduce((total, scene) => total + countWords(scene.plainText), 0),
    [scopedScenes],
  );
  const scopedPageCount = scopedWordCount ? Math.ceil(scopedWordCount / 250) : 0;
  const scopedReadMinutes = scopedWordCount ? Math.max(1, Math.ceil(scopedWordCount / 200)) : 0;
  const scopeLabel = useMemo(() => {
    if (scope.kind === "story") return { primary: "Everything", secondary: "Full manuscript" };
    if (scope.kind === "act") {
      const label = structureLabels?.acts.get(scope.id)?.label ?? "Full Act";
      return { primary: label, secondary: "Full act" };
    }
    if (scope.kind === "chapter") {
      const label = structureLabels?.chapters.get(scope.id)?.label ?? "Chapter";
      const act = tree.data?.acts.find((candidate) =>
        candidate.chapters.some((chapter) => chapter.id === scope.id),
      );
      return {
        primary: label,
        secondary: act ? (structureLabels?.acts.get(act.id)?.label ?? "Chapter") : "Chapter",
      };
    }
    return {
      primary: selectedLocation
        ? (structureLabels?.scenes.get(selectedLocation.scene.id)?.label ?? "Current Scene")
        : "Current Scene",
      secondary: selectedLocation
        ? (structureLabels?.chapters.get(selectedLocation.chapter.id)?.label ?? "Scene")
        : "Scene",
    };
  }, [scope, selectedLocation, structureLabels, tree.data]);

  const changeScope = async (nextScope: ManuscriptScope) => {
    await editorRef.current?.flush();
    await updateSearch({ scope: nextScope.kind === "story" ? undefined : scopeValue(nextScope) });
  };
  const selectScene = async (sceneId: string) => {
    await editorRef.current?.flush();
    await updateSearch({ scene: sceneId, scope: `scene:${sceneId}`, view: undefined });
  };

  const chooseScope = async (nextScope: ManuscriptScope) => {
    setScopeMenuOpen(false);
    if (nextScope.kind === "scene") await selectScene(nextScope.id);
    else await changeScope(nextScope);
  };

  const handleScopeMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    if (!options.length) return;
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? Math.min(options.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex < 0 ? options.length - 1 : currentIndex - 1);
    options[nextIndex]?.focus();
  };

  if (tree.isLoading) return <div className="page loading">Opening manuscript…</div>;
  if (tree.error || !tree.data)
    return (
      <div className="page">
        <ErrorNotice error={tree.error ?? new Error("Project not found.")} />
      </div>
    );

  return (
    <div className="project-workspace">
      <nav className="mobile-project-nav" aria-label="Project workspace">
        <button
          type="button"
          className={tab === "manuscript" && view === "write" ? "active" : ""}
          aria-current={tab === "manuscript" && view === "write" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: undefined, view: undefined });
          }}
        >
          <BookOpenText size={16} /> Write
        </button>
        <button
          type="button"
          className={tab === "manuscript" && view === "outline" ? "active" : ""}
          aria-current={tab === "manuscript" && view === "outline" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: undefined, view: "outline" });
          }}
        >
          <FileText size={16} /> Outline
        </button>
        <button
          type="button"
          className={tab === "manuscript" && view === "notes" ? "active" : ""}
          aria-current={tab === "manuscript" && view === "notes" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: undefined, view: "notes" });
          }}
        >
          <StickyNote size={16} /> Notes
        </button>
        <button
          type="button"
          className={tab === "compendium" ? "active" : ""}
          aria-current={tab === "compendium" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: "compendium", view: undefined });
          }}
        >
          <BookMarked size={16} /> Compendium
        </button>
        <button
          type="button"
          className={tab === "chat" ? "active" : ""}
          aria-current={tab === "chat" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: "chat", view: undefined });
          }}
        >
          <MessageCircle size={16} /> Chat
        </button>
        <button
          type="button"
          className={tab === "ideation" ? "active" : ""}
          aria-current={tab === "ideation" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: "ideation", view: undefined });
          }}
        >
          <Lightbulb size={16} /> Ideation
        </button>
        <button
          type="button"
          className={tab === "settings" || moreOpen ? "active" : ""}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={17} /> More
        </button>
      </nav>

      <div className="project-bar">
        <div className="project-title-row">
          <p className="eyebrow">Project</p>
          <div className="project-title-actions">
            <h1>{tree.data.project.title}</h1>
            <button
              type="button"
              title="Rename Project"
              onClick={async () => {
                const title = (
                  await dialog.prompt({
                    title: "Rename Project",
                    label: "Project title",
                    initialValue: tree.data.project.title,
                  })
                )?.trim();
                if (!title || title === tree.data?.project.title) return;
                await api(`/api/projects/${projectId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ title }),
                });
                await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
              }}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              title="Delete Project"
              onClick={async () => {
                const acts = tree.data.acts.length;
                const chapters = tree.data.acts.reduce((sum, act) => sum + act.chapters.length, 0);
                const scenes = allScenes.length;
                if (
                  !(await dialog.confirm({
                    title: `Delete “${tree.data.project.title}”?`,
                    body: `This permanently deletes ${acts} acts, ${chapters} chapters, ${scenes} scenes, Compendium entries, Chat history, and generation history. This cannot be undone.`,
                    confirmLabel: "Delete Project",
                    destructive: true,
                  }))
                )
                  return;
                await api(`/api/projects/${projectId}`, { method: "DELETE" });
                window.location.assign("/");
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        <button
          type="button"
          className="button ghost project-export"
          onClick={() => setExportOpen(true)}
        >
          <Download size={15} /> Export
        </button>
        <nav className="project-tabs">
          <button
            type="button"
            className={tab === "manuscript" ? "active" : ""}
            onClick={() => void updateSearch({ tab: undefined })}
          >
            <BookOpenText size={16} /> Manuscript
          </button>
          <button
            type="button"
            className={tab === "chat" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              setCompendiumOpen(false);
              await updateSearch({ tab: "chat" });
            }}
          >
            <MessageCircle size={16} /> Chat
          </button>
          <button
            type="button"
            className={tab === "ideation" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: "ideation" });
            }}
          >
            <Lightbulb size={16} /> Ideation
          </button>
          <button
            type="button"
            className={tab === "settings" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: "settings" });
            }}
          >
            <Settings size={16} /> Settings
          </button>
          {(tab === "manuscript" || tab === "chat") && (
            <button
              type="button"
              className={`mobile-only-tab ${compendiumOpen ? "active" : ""}`}
              aria-pressed={compendiumOpen}
              aria-label={compendiumOpen ? "Show manuscript" : "Show compendium"}
              onClick={() => setCompendiumOpen(!compendiumOpen)}
            >
              <BookMarked size={16} /> Compendium
            </button>
          )}
        </nav>
      </div>

      {tab === "manuscript" || tab === "compendium" ? (
        <div
          className={`manuscript-layout ${compendiumOpen || tab === "compendium" ? "compendium-open" : ""} ${tab === "compendium" ? "mobile-compendium-view" : ""} ${selectedEntryId ? "entry-open" : ""}`}
        >
          <CompendiumPanel
            projectId={projectId}
            entries={compendium.data ?? []}
            selectedEntryId={selectedEntryId}
            onSelect={(entry) => void updateSearch({ entry: entry ?? undefined })}
          />
          <div className="manuscript-main">
            <div className="manuscript-viewbar">
              <div className="manuscript-view-tabs">
                <button
                  type="button"
                  className={view === "write" ? "active" : ""}
                  onClick={() => void updateSearch({ view: undefined })}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={view === "outline" ? "active" : ""}
                  onClick={async () => {
                    await editorRef.current?.flush();
                    await updateSearch({ view: "outline" });
                  }}
                >
                  Outline
                </button>
                <button
                  type="button"
                  className={view === "notes" ? "active" : ""}
                  onClick={async () => {
                    await editorRef.current?.flush();
                    await updateSearch({ view: "notes" });
                  }}
                >
                  Notes
                </button>
              </div>
              {view === "write" && scope ? (
                <div className="manuscript-scope-controls">
                  <span className="manuscript-scope-label">Viewing</span>
                  <div ref={scopePickerRef} className="manuscript-scope-picker">
                    <button
                      type="button"
                      className={`manuscript-scope-trigger ${scopeMenuOpen ? "open" : ""}`}
                      aria-label="Viewing mode"
                      aria-haspopup="listbox"
                      aria-expanded={scopeMenuOpen}
                      onClick={() => setScopeMenuOpen((current) => !current)}
                    >
                      <span className="manuscript-scope-trigger-copy">
                        <strong>{scopeLabel.primary}</strong>
                        <small>{scopeLabel.secondary}</small>
                      </span>
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                    {scopeMenuOpen ? (
                      <div
                        className="manuscript-scope-menu"
                        role="listbox"
                        aria-label="Manuscript viewing scope"
                        onKeyDown={handleScopeMenuKeyDown}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={scope.kind === "story"}
                          className="manuscript-scope-option featured"
                          onClick={() => void chooseScope({ kind: "story" })}
                        >
                          <Layers3 size={16} aria-hidden="true" />
                          <span>
                            <strong>Everything</strong>
                            <small>Full manuscript</small>
                          </span>
                          {scope.kind === "story" ? <Check size={15} aria-hidden="true" /> : null}
                        </button>
                        {selectedSceneId && selectedLocation ? (
                          <button
                            type="button"
                            role="option"
                            aria-selected={scope.kind === "scene" && scope.id === selectedSceneId}
                            className="manuscript-scope-option featured"
                            onClick={() => void chooseScope({ kind: "scene", id: selectedSceneId })}
                          >
                            <BookOpenText size={16} aria-hidden="true" />
                            <span>
                              <strong>Current Scene</strong>
                              <small>
                                {structureLabels?.scenes.get(selectedLocation.scene.id)?.label}
                              </small>
                            </span>
                            {scope.kind === "scene" && scope.id === selectedSceneId ? (
                              <Check size={15} aria-hidden="true" />
                            ) : null}
                          </button>
                        ) : null}
                        {tree.data.acts.map((act) => (
                          <fieldset
                            key={act.id}
                            className="manuscript-scope-group"
                            aria-label={structureLabels?.acts.get(act.id)?.label ?? "Act"}
                          >
                            <legend className="manuscript-scope-group-label">
                              {structureLabels?.acts.get(act.id)?.label ?? "Act"}
                            </legend>
                            <button
                              type="button"
                              role="option"
                              aria-selected={scope.kind === "act" && scope.id === act.id}
                              className="manuscript-scope-option nested"
                              onClick={() => void chooseScope({ kind: "act", id: act.id })}
                            >
                              <span>
                                <strong>Full Act</strong>
                                <small>
                                  {act.chapters.length}{" "}
                                  {act.chapters.length === 1 ? "chapter" : "chapters"}
                                </small>
                              </span>
                              {scope.kind === "act" && scope.id === act.id ? (
                                <Check size={15} aria-hidden="true" />
                              ) : null}
                            </button>
                            {act.chapters.map((chapter) => (
                              <button
                                type="button"
                                role="option"
                                aria-selected={scope.kind === "chapter" && scope.id === chapter.id}
                                className="manuscript-scope-option nested"
                                key={chapter.id}
                                onClick={() =>
                                  void chooseScope({ kind: "chapter", id: chapter.id })
                                }
                              >
                                <span>
                                  <strong>
                                    {structureLabels?.chapters.get(chapter.id)?.label ?? "Chapter"}
                                  </strong>
                                  <small>
                                    {chapter.scenes.length}{" "}
                                    {chapter.scenes.length === 1 ? "scene" : "scenes"}
                                  </small>
                                </span>
                                {scope.kind === "chapter" && scope.id === chapter.id ? (
                                  <Check size={15} aria-hidden="true" />
                                ) : null}
                              </button>
                            ))}
                          </fieldset>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="manuscript-scope-stats" aria-live="polite">
                    <strong>{new Intl.NumberFormat().format(scopedWordCount)} words</strong>
                    <span>
                      {scopedPageCount} {scopedPageCount === 1 ? "page" : "pages"} ·{" "}
                      {scopedReadMinutes} min read
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="manuscript-view-content">
              {view === "outline" ? (
                <DeferredWorkspace name="outline">
                  <OutlineGrid
                    projectId={projectId}
                    tree={tree.data}
                    entries={compendium.data ?? []}
                    onOpenScene={selectScene}
                    onOpenEntry={setPreviewEntryIds}
                  />
                </DeferredWorkspace>
              ) : view === "notes" ? (
                <DeferredWorkspace name="notes">
                  <ProjectNotesPanel projectId={projectId} />
                </DeferredWorkspace>
              ) : scope ? (
                <DeferredWorkspace name="editor">
                  <ManuscriptEditor
                    ref={editorRef}
                    key={scopeValue(scope)}
                    tree={tree.data}
                    scope={scope}
                    entries={compendium.data ?? []}
                    baseModel={settings.data?.baseModel ?? "asterism/fake-prose"}
                    models={
                      models.data ?? [{ id: "asterism/fake-prose", name: "Asterism Fake Prose" }]
                    }
                    onSaved={(updated) =>
                      client.setQueryData<ManuscriptTree>(["project-tree", projectId], (current) =>
                        current ? updateSceneInTree(current, updated) : current,
                      )
                    }
                    onOpenEntry={(entryIds, direct) => {
                      if (direct && entryIds.length === 1)
                        void updateSearch({ entry: entryIds[0] });
                      else setPreviewEntryIds(entryIds);
                    }}
                    onSelectScope={(nextScope) => void changeScope(nextScope)}
                    onSelectScene={selectScene}
                  />
                </DeferredWorkspace>
              ) : (
                <div className="empty-editor">
                  <h2>Create a Scene to begin</h2>
                </div>
              )}
            </div>

            <CompendiumEntryDrawer
              projectId={projectId}
              entry={(compendium.data ?? []).find((entry) => entry.id === selectedEntryId) ?? null}
              entries={compendium.data ?? []}
              mentionCount={selectedEntryMentionCount}
              onClose={() => void updateSearch({ entry: undefined })}
            />
          </div>
        </div>
      ) : null}
      {tab === "ideation" ? (
        <DeferredWorkspace name="ideation">
          <IdeationPanel projectId={projectId} />
        </DeferredWorkspace>
      ) : null}
      {tab === "chat" ? (
        <div
          className={`manuscript-layout chat-layout ${compendiumOpen ? "compendium-open" : ""} ${selectedEntryId ? "entry-open" : ""}`}
        >
          <CompendiumPanel
            projectId={projectId}
            entries={compendium.data ?? []}
            selectedEntryId={selectedEntryId}
            onSelect={(entry) => void updateSearch({ entry: entry ?? undefined })}
          />
          <div className="manuscript-main">
            <DeferredWorkspace name="chat">
              <ChatPanel
                projectId={projectId}
                tree={tree.data}
                entries={compendium.data ?? []}
                baseModel={settings.data?.baseModel ?? "asterism/fake-prose"}
                models={models.data ?? [{ id: "asterism/fake-prose", name: "Asterism Fake Prose" }]}
                onOpenEntry={setPreviewEntryIds}
                threadId={search.thread ?? null}
                onThreadChange={(thread) => void updateSearch({ thread: thread ?? undefined })}
              />
            </DeferredWorkspace>
            <CompendiumEntryDrawer
              projectId={projectId}
              entry={(compendium.data ?? []).find((entry) => entry.id === selectedEntryId) ?? null}
              entries={compendium.data ?? []}
              mentionCount={selectedEntryMentionCount}
              onClose={() => void updateSearch({ entry: undefined })}
            />
          </div>
        </div>
      ) : null}
      {tab === "settings" ? (
        <DeferredWorkspace name="project settings">
          <ProjectSettingsPanel
            projectId={projectId}
            project={tree.data.project}
            entries={compendium.data ?? []}
          />
        </DeferredWorkspace>
      ) : null}

      {moreOpen ? (
        <div className="mobile-sheet-backdrop">
          <button
            type="button"
            className="mobile-sheet-dismiss"
            aria-label="Close project menu"
            onClick={() => setMoreOpen(false)}
          />
          <section
            className="mobile-sheet mobile-project-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-project-menu-title"
            onKeyDown={trapFocusWithin}
          >
            <div className="mobile-sheet-handle" />
            <header>
              <div>
                <p className="eyebrow">Project</p>
                <h2 id="mobile-project-menu-title">{tree.data.project.title}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                ref={moreCloseRef}
                aria-label="Close project menu"
                onClick={() => setMoreOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="mobile-project-menu-grid">
              <button
                type="button"
                onClick={async () => {
                  setMoreOpen(false);
                  const title = (
                    await dialog.prompt({
                      title: "Rename Project",
                      label: "Project title",
                      initialValue: tree.data.project.title,
                    })
                  )?.trim();
                  if (!title || title === tree.data.project.title) return;
                  await api(`/api/projects/${projectId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ title }),
                  });
                  await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
                }}
              >
                <Pencil size={17} /> Rename project
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setExportOpen(true);
                }}
              >
                <Download size={17} /> Export manuscript
              </button>
              <button
                type="button"
                onClick={async () => {
                  setMoreOpen(false);
                  await editorRef.current?.flush();
                  await updateSearch({ tab: "settings", view: undefined });
                }}
              >
                <Settings size={17} /> Project settings
              </button>
              <Link to="/" onClick={() => setMoreOpen(false)}>
                <Library size={17} /> Back to projects
              </Link>
              <a href="/prompts">
                <FileText size={17} /> Prompts
              </a>
              <a href="/settings">
                <Settings size={17} /> App settings
              </a>
            </div>
            <button
              type="button"
              className="mobile-project-delete"
              onClick={async () => {
                setMoreOpen(false);
                const acts = tree.data.acts.length;
                const chapters = tree.data.acts.reduce((sum, act) => sum + act.chapters.length, 0);
                if (
                  !(await dialog.confirm({
                    title: `Delete “${tree.data.project.title}”?`,
                    body: `This permanently deletes ${acts} acts, ${chapters} chapters, ${allScenes.length} scenes, Compendium entries, Chat history, and generation history. This cannot be undone.`,
                    confirmLabel: "Delete Project",
                    destructive: true,
                  }))
                )
                  return;
                await api(`/api/projects/${projectId}`, { method: "DELETE" });
                window.location.assign("/");
              }}
            >
              <Trash2 size={17} /> Delete project
            </button>
          </section>
        </div>
      ) : null}

      {exportOpen ? (
        <ExportDialog projectId={projectId} onClose={() => setExportOpen(false)} />
      ) : null}

      {previewEntryIds.length > 0 ? (
        <div className="modal-backdrop">
          <section className="modal mention-preview" aria-label="Compendium mention">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Compendium mention</p>
                <h2>{previewEntryIds.length > 1 ? "Choose an entry" : "Quick reference"}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPreviewEntryIds([])}
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mention-preview-list">
              {(compendium.data ?? [])
                .filter((entry) => previewEntryIds.includes(entry.id))
                .map((entry) => (
                  <article key={entry.id}>
                    <div>
                      <strong>{entry.name}</strong>
                      <small>{entry.typeId.replace("story.", "").replace("project.", "")}</small>
                      <p>
                        {entry.content.kind === "text"
                          ? entry.content.text.slice(0, 280)
                          : entry.content.kind === "rich_text"
                            ? entry.content.plainText.slice(0, 280)
                            : entry.content.values.map((value) => value.label).join(", ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => {
                        void updateSearch({ entry: entry.id, tab: undefined });
                        setPreviewEntryIds([]);
                      }}
                    >
                      Open entry
                    </button>
                  </article>
                ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
