import type { ManuscriptTree } from "@skriv/contracts";
import { findMentions, manuscriptLabels } from "@skriv/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookMarked,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Layers3,
  Library,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
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
import { skriv } from "../api.js";
import { ErrorNotice } from "../components/AppShell.js";
import { CompendiumEntryDrawer, CompendiumPanel } from "../components/CompendiumPanel.js";
import { useAppDialog } from "../components/DialogProvider.js";
import { ExportDialog } from "../components/ExportDialog.js";
import { useSettings } from "../components/SettingsProvider.js";
import type {
  FirstSceneGenerationIntent,
  ManuscriptEditorHandle,
} from "../components/ManuscriptEditor.js";
import { type ManuscriptScope, scenesForScope } from "../editor/manuscriptDocument.js";
import { registerPersistenceFlusher } from "../persistence.js";
import { trapFocusWithin } from "../utils/focus.js";
import { updateSceneInTree } from "../utils/manuscript.js";
import { recordProjectAccess } from "../utils/projectAccess.js";

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
const compendiumPreferenceKey = "skriv:workspace:compendium-open";

function preferredCompendiumState(): boolean {
  if (window.matchMedia("(max-width: 1023px)").matches) return false;
  return localStorage.getItem(compendiumPreferenceKey) !== "false";
}

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
  const { openSettings, openPrompts } = useSettings();
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const search = useSearch({ from: "/projects/$projectId" });
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const client = useQueryClient();
  const dialog = useAppDialog();
  const tab: Tab = search.tab ?? "manuscript";
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [ideationCompendiumOpen, setIdeationCompendiumOpen] = useState(false);
  const [firstSceneGenerationIntent, setFirstSceneGenerationIntent] =
    useState<FirstSceneGenerationIntent | null>(null);
  const moreCloseRef = useRef<HTMLButtonElement>(null);
  const moreControlRef = useRef<HTMLDivElement>(null);
  const workspaceScopePickerRef = useRef<HTMLDivElement>(null);
  const ideationCompendiumCloseRef = useRef<HTMLButtonElement>(null);
  const [compendiumOpen, setCompendiumOpen] = useState(preferredCompendiumState);
  const [editorHeaderTarget, setEditorHeaderTarget] = useState<HTMLDivElement | null>(null);
  const view: ManuscriptView = search.view ?? "write";
  const scope = parseScope(search.scope);
  const selectedEntryId = search.entry ?? null;

  useEffect(() => recordProjectAccess(projectId), [projectId]);

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
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 700px)").matches) moreCloseRef.current?.focus();
      else moreControlRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setMoreOpen(false);
        return;
      }
      if (window.matchMedia("(max-width: 700px)").matches) return;
      if (!moreControlRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setScopeMenuOpen(false);
        return;
      }
      if (!workspaceScopePickerRef.current?.contains(event.target as Node)) setScopeMenuOpen(false);
    };
    requestAnimationFrame(() =>
      workspaceScopePickerRef.current
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
    const compactQuery = window.matchMedia("(max-width: 1023px)");
    const handleViewportChange = () => setCompendiumOpen(preferredCompendiumState());
    compactQuery.addEventListener("change", handleViewportChange);
    return () => compactQuery.removeEventListener("change", handleViewportChange);
  }, []);
  useEffect(() => {
    if (
      (tab === "chat" || tab === "compendium") &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setCompendiumOpen(false);
    }
  }, [tab]);

  const toggleCompendium = () => {
    setCompendiumOpen((current) => {
      const next = !current;
      if (!window.matchMedia("(max-width: 1023px)").matches)
        localStorage.setItem(compendiumPreferenceKey, String(next));
      return next;
    });
  };
  const [previewEntryIds, setPreviewEntryIds] = useState<string[]>([]);
  const editorRef = useRef<ManuscriptEditorHandle | null>(null);
  useEffect(() => registerPersistenceFlusher(async () => editorRef.current?.flush()), []);
  const tree = useQuery({
    queryKey: ["project-tree", projectId],
    queryFn: () => skriv().projects.tree(projectId),
  });
  const compendium = useQuery({
    queryKey: ["compendium", projectId],
    queryFn: () => skriv().compendium.list(projectId),
  });
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => skriv().settings.ai(),
  });
  const credential = useQuery({
    queryKey: ["openrouter-credential"],
    queryFn: () => skriv().settings.credential(),
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => skriv().settings.models() as Promise<Model[]>,
    enabled: credential.data?.configured === true,
  });
  const aiConfigured = credential.data?.configured === true;
  const baseModel = settings.data?.baseModel ?? "openrouter/auto";
  const modelOptions = models.data ?? [{ id: baseModel, name: "OpenRouter Auto" }];
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
        search: (previous: Record<string, unknown>) => {
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

  const closeIdeationCompendium = useCallback(() => {
    setIdeationCompendiumOpen(false);
    void updateSearch({ entry: undefined });
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>("[data-ideation-compendium-trigger]")?.focus(),
    );
  }, [updateSearch]);

  useEffect(() => {
    if (!ideationCompendiumOpen) return;
    requestAnimationFrame(() => ideationCompendiumCloseRef.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeIdeationCompendium();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [closeIdeationCompendium, ideationCompendiumOpen]);

  useEffect(() => {
    if (tab !== "ideation" && ideationCompendiumOpen) closeIdeationCompendium();
  }, [closeIdeationCompendium, ideationCompendiumOpen, tab]);

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

  const openFirstScene = async () => {
    const firstScene = allScenes[0];
    if (!firstScene) return;
    await updateSearch({
      tab: undefined,
      view: undefined,
      scene: firstScene.id,
      scope: `scene:${firstScene.id}`,
    });
  };

  const generateFirstScene = async (options: {
    instructions: string;
    targetLength: number | null;
    lengthUnit: "words" | "paragraphs";
    modelOverride: string | null;
  }) => {
    const firstScene = allScenes[0];
    if (!firstScene) return;
    setFirstSceneGenerationIntent({
      id: crypto.randomUUID(),
      sceneId: firstScene.id,
      options: {
        workflow: "prose.first_scene",
        ...options,
        eventTarget: "",
      },
    });
    await openFirstScene();
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
          aria-label="Write"
          title="Write"
          className={tab === "manuscript" && view === "write" ? "active" : ""}
          aria-current={tab === "manuscript" && view === "write" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: undefined, view: undefined });
          }}
        >
          <BookOpenText size={17} />
        </button>
        <button
          type="button"
          aria-label="Outline"
          title="Outline"
          className={tab === "manuscript" && view === "outline" ? "active" : ""}
          aria-current={tab === "manuscript" && view === "outline" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: undefined, view: "outline" });
          }}
        >
          <FileText size={17} />
        </button>
        <button
          type="button"
          aria-label="Compendium"
          title="Compendium"
          className={tab === "compendium" ? "active" : ""}
          aria-current={tab === "compendium" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: "compendium", view: undefined });
          }}
        >
          <BookMarked size={17} />
        </button>
        <button
          type="button"
          aria-label="Chat"
          title="Chat"
          className={tab === "chat" ? "active" : ""}
          aria-current={tab === "chat" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: "chat", view: undefined });
          }}
        >
          <MessageCircle size={17} />
        </button>
        <button
          type="button"
          aria-label="Ideation"
          title="Ideation"
          className={tab === "ideation" ? "active" : ""}
          aria-current={tab === "ideation" ? "page" : undefined}
          onClick={async () => {
            await editorRef.current?.flush();
            await updateSearch({ tab: "ideation", view: undefined });
          }}
        >
          <Lightbulb size={17} />
        </button>
        <button
          type="button"
          aria-label="More"
          title="More"
          className={tab === "settings" || view === "notes" || moreOpen ? "active" : ""}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={18} />
        </button>
      </nav>

      <header className="workspace-header">
        <div className="workspace-project-identity">
          <Link to="/" className="workspace-home" aria-label="Back to projects">
            <ArrowLeft size={17} />
          </Link>
          <button
            type="button"
            className="workspace-sidebar-toggle"
            aria-label={compendiumOpen ? "Collapse Compendium" : "Open Compendium"}
            aria-pressed={compendiumOpen}
            onClick={toggleCompendium}
          >
            {compendiumOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <span className="workspace-project-title" title={tree.data.project.title}>
            {tree.data.project.title}
          </span>
        </div>

        <nav className="workspace-view-tabs" aria-label="Project views">
          <button
            type="button"
            className={tab === "manuscript" && view === "write" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: undefined, view: undefined });
            }}
          >
            <BookOpenText size={16} /> <span>Write</span>
          </button>
          <button
            type="button"
            className={tab === "manuscript" && view === "outline" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: undefined, view: "outline" });
            }}
          >
            <FileText size={16} /> <span>Outline</span>
          </button>
          <button
            type="button"
            className={tab === "manuscript" && view === "notes" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: undefined, view: "notes" });
            }}
          >
            <StickyNote size={16} /> <span>Notes</span>
          </button>
          <button
            type="button"
            className={tab === "chat" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: "chat", view: undefined });
            }}
          >
            <MessageCircle size={16} /> <span>Chat</span>
          </button>
          <button
            type="button"
            className={tab === "ideation" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              await updateSearch({ tab: "ideation", view: undefined });
            }}
          >
            <Lightbulb size={16} /> <span>Ideation</span>
          </button>
        </nav>

        <div className="workspace-context">
          {tab === "manuscript" && view === "write" && scope ? (
            <>
              <div className="workspace-scene-stepper">
                <button
                  type="button"
                  aria-label="Previous Scene"
                  disabled={!selectedLocation || allScenes[0]?.id === selectedLocation.scene.id}
                  onClick={() => {
                    const index = allScenes.findIndex(
                      (scene) => scene.id === selectedLocation?.scene.id,
                    );
                    const previous = index > 0 ? allScenes[index - 1] : undefined;
                    if (previous) void selectScene(previous.id);
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Next Scene"
                  disabled={!selectedLocation || allScenes.at(-1)?.id === selectedLocation.scene.id}
                  onClick={() => {
                    const index = allScenes.findIndex(
                      (scene) => scene.id === selectedLocation?.scene.id,
                    );
                    const next =
                      index >= 0 && index < allScenes.length - 1 ? allScenes[index + 1] : undefined;
                    if (next) void selectScene(next.id);
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div
                ref={workspaceScopePickerRef}
                className="manuscript-scope-picker workspace-scope-picker"
              >
                <button
                  type="button"
                  className={`manuscript-scope-trigger ${scopeMenuOpen ? "open" : ""}`}
                  aria-label="Manuscript navigator"
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
                    className="manuscript-scope-menu workspace-scope-menu"
                    role="listbox"
                    aria-label="Manuscript hierarchy"
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
                            <small>{act.chapters.length} chapters</small>
                          </span>
                          {scope.kind === "act" && scope.id === act.id ? (
                            <Check size={15} aria-hidden="true" />
                          ) : null}
                        </button>
                        {act.chapters.map((chapter) => (
                          <div className="workspace-scope-chapter" key={chapter.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={scope.kind === "chapter" && scope.id === chapter.id}
                              className="manuscript-scope-option nested"
                              onClick={() => void chooseScope({ kind: "chapter", id: chapter.id })}
                            >
                              <span>
                                <strong>
                                  {structureLabels?.chapters.get(chapter.id)?.label ?? "Chapter"}
                                </strong>
                                <small>{chapter.scenes.length} scenes</small>
                              </span>
                              {scope.kind === "chapter" && scope.id === chapter.id ? (
                                <Check size={15} aria-hidden="true" />
                              ) : null}
                            </button>
                            {chapter.scenes.map((scene) => (
                              <button
                                type="button"
                                role="option"
                                aria-selected={scope.kind === "scene" && scope.id === scene.id}
                                className="manuscript-scope-option scene-option"
                                key={scene.id}
                                onClick={() => void chooseScope({ kind: "scene", id: scene.id })}
                              >
                                <span>
                                  <strong>
                                    {structureLabels?.scenes.get(scene.id)?.label ?? "Scene"}
                                  </strong>
                                </span>
                                {scope.kind === "scene" && scope.id === scene.id ? (
                                  <Check size={15} aria-hidden="true" />
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ))}
                      </fieldset>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="manuscript-scope-stats workspace-scope-stats" aria-live="polite">
                <strong>{new Intl.NumberFormat().format(scopedWordCount)} words</strong>
                <span>{scope.kind === "story" ? "Full Manuscript" : scopeLabel.primary}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="workspace-actions">
          <div className="workspace-editor-slot" ref={setEditorHeaderTarget} />
          <button type="button" className="workspace-export" onClick={() => setExportOpen(true)}>
            <Download size={15} /> <span>Export</span>
          </button>
          <div className="workspace-more-control" ref={moreControlRef}>
            <button
              type="button"
              className={moreOpen ? "active" : ""}
              aria-label="Project menu"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((current) => !current)}
            >
              <MoreHorizontal size={17} />
            </button>
            {moreOpen ? (
              <div className="workspace-more-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMoreOpen(false);
                    await editorRef.current?.flush();
                    await updateSearch({ tab: "settings", view: undefined });
                  }}
                >
                  <Settings size={16} /> Project settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    openPrompts();
                  }}
                  role="menuitem"
                >
                  <FileText size={16} /> Prompts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    openSettings();
                  }}
                  role="menuitem"
                >
                  <Settings size={16} /> App settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMoreOpen(false);
                    const title = (
                      await dialog.prompt({
                        title: "Rename Project",
                        label: "Project title",
                        initialValue: tree.data.project.title,
                      })
                    )?.trim();
                    if (!title || title === tree.data?.project.title) return;
                    await skriv().projects.update(projectId, { title });
                    await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
                  }}
                >
                  <Pencil size={16} /> Rename project
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={async () => {
                    setMoreOpen(false);
                    const acts = tree.data.acts.length;
                    const chapters = tree.data.acts.reduce(
                      (sum, act) => sum + act.chapters.length,
                      0,
                    );
                    if (
                      !(await dialog.confirm({
                        title: `Delete “${tree.data.project.title}”?`,
                        body: `This permanently deletes ${acts} acts, ${chapters} chapters, ${allScenes.length} scenes, Compendium entries, Chat history, and generation history. This cannot be undone.`,
                        confirmLabel: "Delete Project",
                        destructive: true,
                      }))
                    )
                      return;
                    await skriv().projects.remove(projectId);
                    window.location.assign("/");
                  }}
                >
                  <Trash2 size={16} /> Delete project
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {!credential.isLoading && !aiConfigured ? (
        <div className="ai-key-guidance" role="status">
          AI actions are disabled until an OpenRouter key is configured. Non-AI writing remains
          fully offline.{" "}
          <button type="button" className="link" onClick={openSettings}>
            Open Settings
          </button>
        </div>
      ) : null}

      {tab === "manuscript" || tab === "compendium" ? (
        <div
          className={`manuscript-layout ${compendiumOpen || tab === "compendium" ? "compendium-open" : ""} ${tab === "compendium" ? "mobile-compendium-view" : ""} ${selectedEntryId ? "entry-open" : ""}`}
        >
          {compendiumOpen ? (
            <button
              type="button"
              className="tablet-sidebar-backdrop"
              aria-label="Close Compendium"
              onClick={() => setCompendiumOpen(false)}
            />
          ) : null}
          <CompendiumPanel
            projectId={projectId}
            entries={compendium.data ?? []}
            selectedEntryId={selectedEntryId}
            onSelect={(entry) => void updateSearch({ entry: entry ?? undefined })}
          />
          <div className="manuscript-main">
            <div className="manuscript-view-content">
              {scope ? (
                <div className="manuscript-write-surface" hidden={view !== "write"}>
                  <DeferredWorkspace name="editor">
                    <ManuscriptEditor
                      ref={editorRef}
                      key={scopeValue(scope)}
                      tree={tree.data}
                      scope={scope}
                      entries={compendium.data ?? []}
                      aiConfigured={aiConfigured}
                      baseModel={baseModel}
                      headerActionsTarget={editorHeaderTarget}
                      models={modelOptions}
                      onSaved={(updated) =>
                        client.setQueryData<ManuscriptTree>(
                          ["project-tree", projectId],
                          (current) => (current ? updateSceneInTree(current, updated) : current),
                        )
                      }
                      onOpenEntry={(entryIds, direct) => {
                        if (direct && entryIds.length === 1)
                          void updateSearch({ entry: entryIds[0] });
                        else setPreviewEntryIds(entryIds);
                      }}
                      onSelectScope={(nextScope) => void changeScope(nextScope)}
                      onSelectScene={selectScene}
                      firstSceneGenerationIntent={firstSceneGenerationIntent}
                      onFirstSceneGenerationIntentConsumed={() =>
                        setFirstSceneGenerationIntent(null)
                      }
                    />
                  </DeferredWorkspace>
                </div>
              ) : view === "write" ? (
                <div className="empty-editor">
                  <h2>Create a Scene to begin</h2>
                </div>
              ) : null}
              {view === "outline" ? (
                <DeferredWorkspace name="outline">
                  <OutlineGrid
                    aiConfigured={aiConfigured}
                    baseModel={baseModel}
                    models={modelOptions}
                    projectId={projectId}
                    tree={tree.data}
                    entries={compendium.data ?? []}
                    onOpenScene={selectScene}
                    onOpenEntry={setPreviewEntryIds}
                  />
                </DeferredWorkspace>
              ) : null}
              {view === "notes" ? (
                <DeferredWorkspace name="notes">
                  <ProjectNotesPanel projectId={projectId} />
                </DeferredWorkspace>
              ) : null}
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
        <div className="ideation-workspace">
          <DeferredWorkspace name="ideation">
            <IdeationPanel
              aiConfigured={aiConfigured}
              projectId={projectId}
              entries={compendium.data ?? []}
              firstScene={allScenes[0] ?? null}
              onOpenCompendium={() => setIdeationCompendiumOpen(true)}
              onOpenFirstScene={() => void openFirstScene()}
              onGenerateFirstScene={(options) => void generateFirstScene(options)}
            />
          </DeferredWorkspace>
          {ideationCompendiumOpen ? (
            <div
              className={`ideation-compendium-layer ${selectedEntryId ? "entry-open" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Compendium"
              onKeyDown={trapFocusWithin}
            >
              <button
                type="button"
                className="ideation-compendium-dismiss"
                aria-label="Dismiss Compendium overlay"
                tabIndex={-1}
                onClick={closeIdeationCompendium}
              />
              <section className="ideation-compendium-dialog">
                <div className="ideation-compendium-toolbar">
                  <strong>Compendium</strong>
                  <button
                    ref={ideationCompendiumCloseRef}
                    type="button"
                    className="icon-button"
                    aria-label="Close Compendium"
                    onClick={closeIdeationCompendium}
                  >
                    <X size={16} />
                  </button>
                </div>
                <CompendiumPanel
                  projectId={projectId}
                  entries={compendium.data ?? []}
                  selectedEntryId={selectedEntryId}
                  onSelect={(entry) => void updateSearch({ entry: entry ?? undefined })}
                />
              </section>
              <CompendiumEntryDrawer
                projectId={projectId}
                entry={
                  (compendium.data ?? []).find((entry) => entry.id === selectedEntryId) ?? null
                }
                entries={compendium.data ?? []}
                mentionCount={selectedEntryMentionCount}
                onClose={() => void updateSearch({ entry: undefined })}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === "chat" ? (
        <div
          className={`manuscript-layout chat-layout ${compendiumOpen ? "compendium-open" : ""} ${selectedEntryId ? "entry-open" : ""}`}
        >
          {compendiumOpen ? (
            <button
              type="button"
              className="tablet-sidebar-backdrop"
              aria-label="Close Compendium"
              onClick={() => setCompendiumOpen(false)}
            />
          ) : null}
          <CompendiumPanel
            projectId={projectId}
            entries={compendium.data ?? []}
            selectedEntryId={selectedEntryId}
            onSelect={(entry) => void updateSearch({ entry: entry ?? undefined })}
          />
          <div className="manuscript-main">
            <DeferredWorkspace name="chat">
              <ChatPanel
                aiConfigured={aiConfigured}
                projectId={projectId}
                tree={tree.data}
                entries={compendium.data ?? []}
                baseModel={baseModel}
                models={modelOptions}
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
            scenes={allScenes}
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
                className={tab === "manuscript" && view === "notes" ? "active" : ""}
                onClick={async () => {
                  setMoreOpen(false);
                  await editorRef.current?.flush();
                  await updateSearch({ tab: undefined, view: "notes" });
                }}
              >
                <StickyNote size={17} /> Notes
              </button>
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
                  await skriv().projects.update(projectId, { title });
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
              <button type="button" onClick={openPrompts}>
                <FileText size={17} /> Prompts
              </button>
              <button type="button" onClick={openSettings}>
                <Settings size={17} /> App settings
              </button>
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
                await skriv().projects.remove(projectId);
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
