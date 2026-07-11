import type { AiSettings, CompendiumEntry, ManuscriptTree, Scene } from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { BookOpenText, Download, Lightbulb, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "../components/AppShell.js";
import { CompendiumEntryDrawer, CompendiumPanel } from "../components/CompendiumPanel.js";
import { IdeationPanel } from "../components/IdeationPanel.js";
import {
  ManuscriptEditor,
  type ManuscriptEditorHandle,
  type ManuscriptScope,
} from "../components/ManuscriptEditor.js";
import { OutlineGrid } from "../components/OutlineGrid.js";

type Tab = "manuscript" | "ideation";
type ManuscriptView = "write" | "outline";
type Model = { id: string; name: string };

function updateScene(tree: ManuscriptTree, updated: Scene): ManuscriptTree {
  return {
    ...tree,
    acts: tree.acts.map((act) => ({
      ...act,
      chapters: act.chapters.map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.map((scene) => (scene.id === updated.id ? updated : scene)),
      })),
    })),
  };
}

function scopeValue(scope: ManuscriptScope): string {
  return `${scope.kind}:${"id" in scope ? scope.id : "all"}`;
}

export function ProjectPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("manuscript");
  const [view, setView] = useState<ManuscriptView>("write");
  const [scope, setScope] = useState<ManuscriptScope | null>({ kind: "story" });
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
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

  useEffect(() => {
    const selected = allScenes.find((scene) => scene.id === selectedSceneId) ?? allScenes[0];
    if (!selected) return;
    if (selected.id !== selectedSceneId) setSelectedSceneId(selected.id);
    if (!scope || (scope.kind === "scene" && !allScenes.some((scene) => scene.id === scope.id))) {
      setScope({ kind: "scene", id: selected.id });
    }
  }, [allScenes, scope, selectedSceneId]);

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

  const changeScope = async (nextScope: ManuscriptScope) => {
    await editorRef.current?.flush();
    setScope(nextScope);
  };
  const selectScene = async (sceneId: string) => {
    await editorRef.current?.flush();
    setSelectedSceneId(sceneId);
    setScope({ kind: "scene", id: sceneId });
    setView("write");
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
      <div className="project-bar">
        <div className="project-title-row">
          <p className="eyebrow">Project</p>
          <div className="project-title-actions">
            <h1>{tree.data.project.title}</h1>
            <button
              type="button"
              title="Rename Project"
              onClick={async () => {
                const title = window.prompt("Rename", tree.data?.project.title)?.trim();
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
                if (!window.confirm("Delete this Project and all of its contents?")) return;
                await api(`/api/projects/${projectId}`, { method: "DELETE" });
                window.location.assign("/");
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        <a className="button ghost project-export" href={`/api/projects/${projectId}/export`}>
          <Download size={15} /> Export
        </a>
        <nav className="project-tabs">
          <button
            type="button"
            className={tab === "manuscript" ? "active" : ""}
            onClick={() => setTab("manuscript")}
          >
            <BookOpenText size={16} /> Manuscript
          </button>
          <button
            type="button"
            className={tab === "ideation" ? "active" : ""}
            onClick={async () => {
              await editorRef.current?.flush();
              setTab("ideation");
            }}
          >
            <Lightbulb size={16} /> Ideation
          </button>
        </nav>
      </div>

      {tab === "manuscript" ? (
        <div className="manuscript-layout compendium-open">
          <CompendiumPanel
            projectId={projectId}
            entries={compendium.data ?? []}
            selectedEntryId={selectedEntryId}
            onSelect={setSelectedEntryId}
          />
          <div className="manuscript-main">
            <div className="manuscript-viewbar">
              <div className="manuscript-view-tabs">
                <button
                  type="button"
                  className={view === "write" ? "active" : ""}
                  onClick={() => setView("write")}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={view === "outline" ? "active" : ""}
                  onClick={async () => {
                    await editorRef.current?.flush();
                    setView("outline");
                  }}
                >
                  Outline
                </button>
              </div>
              {view === "write" && scope ? (
                <div className="manuscript-scope-controls">
                  <label>
                    <span>Viewing mode</span>
                    <select
                      aria-label="Viewing mode"
                      value={scopeValue(scope)}
                      onChange={(event) => {
                        const [kind, id] = event.target.value.split(":");
                        if (kind === "story") void changeScope({ kind: "story" });
                        else if (kind === "act" && id) void changeScope({ kind: "act", id });
                        else if (kind === "chapter" && id)
                          void changeScope({ kind: "chapter", id });
                        else if (kind === "scene" && id) void selectScene(id);
                      }}
                    >
                      {selectedSceneId ? (
                        <option value={`scene:${selectedSceneId}`}>
                          Current Scene · {selectedLocation?.scene.title}
                        </option>
                      ) : null}
                      <option value="story:all">Everything</option>
                      {tree.data.acts.map((act) => (
                        <optgroup key={act.id} label={act.title}>
                          <option value={`act:${act.id}`}>Full Act</option>
                          {act.chapters.map((chapter) => (
                            <option key={chapter.id} value={`chapter:${chapter.id}`}>
                              {chapter.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {scope.kind === "scene" && selectedLocation ? (
                    <div className="scene-breadcrumb-selectors">
                      <select
                        aria-label="Act"
                        value={selectedLocation.act.id}
                        onChange={(event) => {
                          const act = tree.data?.acts.find(
                            (candidate) => candidate.id === event.target.value,
                          );
                          const scene = act?.chapters[0]?.scenes[0];
                          if (scene) selectScene(scene.id);
                        }}
                      >
                        {tree.data.acts.map((act) => (
                          <option key={act.id} value={act.id}>
                            {act.title}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Chapter"
                        value={selectedLocation.chapter.id}
                        onChange={(event) => {
                          const chapter = selectedLocation.act.chapters.find(
                            (candidate) => candidate.id === event.target.value,
                          );
                          if (chapter?.scenes[0]) selectScene(chapter.scenes[0].id);
                        }}
                      >
                        {selectedLocation.act.chapters.map((chapter) => (
                          <option key={chapter.id} value={chapter.id}>
                            {chapter.title}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Scene"
                        value={selectedLocation.scene.id}
                        onChange={(event) => selectScene(event.target.value)}
                      >
                        {selectedLocation.chapter.scenes.map((scene) => (
                          <option key={scene.id} value={scene.id}>
                            {scene.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="manuscript-view-content">
              {view === "outline" ? (
                <OutlineGrid
                  projectId={projectId}
                  tree={tree.data}
                  entries={compendium.data ?? []}
                  onOpenScene={selectScene}
                  onOpenEntry={setPreviewEntryIds}
                />
              ) : scope ? (
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
                      current ? updateScene(current, updated) : current,
                    )
                  }
                  onOpenEntry={(entryIds, direct) => {
                    if (direct && entryIds.length === 1) setSelectedEntryId(entryIds[0] ?? null);
                    else setPreviewEntryIds(entryIds);
                  }}
                  onSelectScene={selectScene}
                />
              ) : (
                <div className="empty-editor">
                  <h2>Create a Scene to begin</h2>
                </div>
              )}
            </div>

            <CompendiumEntryDrawer
              projectId={projectId}
              entry={(compendium.data ?? []).find((entry) => entry.id === selectedEntryId) ?? null}
              mentionCount={selectedEntryMentionCount}
              onClose={() => setSelectedEntryId(null)}
            />
          </div>
        </div>
      ) : null}
      {tab === "ideation" ? <IdeationPanel projectId={projectId} /> : null}

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
                        setSelectedEntryId(entry.id);
                        setPreviewEntryIds([]);
                        setTab("manuscript");
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
