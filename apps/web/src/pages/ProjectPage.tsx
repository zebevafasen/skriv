import type { AiSettings, CompendiumEntry, ManuscriptTree, Scene } from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  BookOpenText,
  ChevronDown,
  Download,
  FileText,
  Lightbulb,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "../components/AppShell.js";
import { CompendiumEntryDrawer, CompendiumPanel } from "../components/CompendiumPanel.js";
import {
  ContinuousManuscriptView,
  type ManuscriptScope,
} from "../components/ContinuousManuscriptView.js";
import { IdeationPanel } from "../components/IdeationPanel.js";
import { SceneEditor } from "../components/SceneEditor.js";

type Tab = "manuscript" | "ideation";
type Model = { id: string; name: string };

export function ProjectPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("manuscript");
  const [sidebar, setSidebar] = useState<"manuscript" | "compendium">("manuscript");
  const [scope, setScope] = useState<ManuscriptScope | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [previewEntryIds, setPreviewEntryIds] = useState<string[]>([]);
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
    if (!selectedSceneId || !allScenes.some((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(allScenes[0]?.id ?? null);
    }
  }, [allScenes, selectedSceneId]);
  const selectedScene = allScenes.find((scene) => scene.id === selectedSceneId) ?? null;
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
  const createScene = useMutation({
    mutationFn: (chapterId: string) =>
      api<Scene>(`/api/chapters/${chapterId}/scenes`, {
        method: "POST",
        body: JSON.stringify({ title: "New Scene" }),
      }),
    onSuccess: async (scene) => {
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setSelectedSceneId(scene.id);
    },
  });
  const createChapter = useMutation({
    mutationFn: (actId: string) =>
      api(`/api/acts/${actId}/chapters`, {
        method: "POST",
        body: JSON.stringify({ title: "New Chapter" }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-tree", projectId] }),
  });
  const createAct = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/acts`, {
        method: "POST",
        body: JSON.stringify({ title: "New Act" }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-tree", projectId] }),
  });
  const refreshTree = () => client.invalidateQueries({ queryKey: ["project-tree", projectId] });
  const mutateTree = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "PATCH" | "POST" | "DELETE";
      body?: object;
    }) => api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    onSuccess: refreshTree,
  });
  const move = (ids: string[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ids.length) return ids;
    const next = [...ids];
    [next[index], next[target]] = [next[target] as string, next[index] as string];
    return next;
  };
  const rename = (path: string, currentTitle: string, body: object = {}) => {
    const title = window.prompt("Rename", currentTitle)?.trim();
    if (title && title !== currentTitle)
      mutateTree.mutate({ path, method: "PATCH", body: { ...body, title } });
  };
  const remove = (path: string, title: string) => {
    if (window.confirm(`Delete ${title} and all of its contents?`))
      mutateTree.mutate({ path, method: "DELETE" });
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
              onClick={() => rename(`/api/projects/${projectId}`, tree.data.project.title)}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              title="Delete Project"
              onClick={async () => {
                if (window.confirm("Delete this Project and all of its contents?")) {
                  await api(`/api/projects/${projectId}`, { method: "DELETE" });
                  window.location.assign("/");
                }
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
            onClick={() => setTab("ideation")}
          >
            <Lightbulb size={16} /> Ideation
          </button>
        </nav>
      </div>
      {tab === "manuscript" ? (
        <div
          className={
            sidebar === "compendium" ? "manuscript-layout compendium-open" : "manuscript-layout"
          }
        >
          {sidebar === "manuscript" ? (
            <aside className="manuscript-tree">
              <div className="sidebar-tabs">
                <button type="button" className="active">
                  <BookOpenText size={14} /> Manuscript
                </button>
                <button type="button" onClick={() => setSidebar("compendium")}>
                  <BookMarked size={14} /> Compendium
                </button>
              </div>
              <div className="tree-title">
                <button
                  type="button"
                  className="tree-scope"
                  onClick={() => setScope({ kind: "story" })}
                >
                  Full story
                </button>
                <button type="button" onClick={() => createAct.mutate()}>
                  <Plus size={15} />
                </button>
              </div>
              {tree.data.acts.map((act, actIndex) => (
                <div key={act.id} className="tree-act">
                  <div className="tree-group">
                    <ChevronDown size={14} />
                    <button
                      type="button"
                      className="tree-scope"
                      onClick={() => setScope({ kind: "act", id: act.id })}
                    >
                      <strong>{act.title}</strong>
                    </button>
                    <span className="tree-actions">
                      <button
                        type="button"
                        title="Move Act up"
                        onClick={() =>
                          mutateTree.mutate({
                            path: `/api/projects/${projectId}/acts/reorder`,
                            method: "POST",
                            body: {
                              orderedIds: move(
                                tree.data.acts.map((item) => item.id),
                                actIndex,
                                -1,
                              ),
                            },
                          })
                        }
                      >
                        <ArrowUp size={10} />
                      </button>
                      <button
                        type="button"
                        title="Move Act down"
                        onClick={() =>
                          mutateTree.mutate({
                            path: `/api/projects/${projectId}/acts/reorder`,
                            method: "POST",
                            body: {
                              orderedIds: move(
                                tree.data.acts.map((item) => item.id),
                                actIndex,
                                1,
                              ),
                            },
                          })
                        }
                      >
                        <ArrowDown size={10} />
                      </button>
                      <button
                        type="button"
                        title="Rename Act"
                        onClick={() => rename(`/api/acts/${act.id}`, act.title)}
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        type="button"
                        title="Delete Act"
                        onClick={() => remove(`/api/acts/${act.id}`, act.title)}
                      >
                        <Trash2 size={10} />
                      </button>
                    </span>
                    <button type="button" onClick={() => createChapter.mutate(act.id)}>
                      <Plus size={13} />
                    </button>
                  </div>
                  {act.chapters.map((chapter, chapterIndex) => (
                    <div key={chapter.id} className="tree-chapter">
                      <div className="tree-group">
                        <FileText size={13} />
                        <button
                          type="button"
                          className="tree-scope"
                          onClick={() => setScope({ kind: "chapter", id: chapter.id })}
                        >
                          {chapter.title}
                        </button>
                        <span className="tree-actions">
                          <button
                            type="button"
                            title="Move Chapter up"
                            onClick={() =>
                              mutateTree.mutate({
                                path: `/api/acts/${act.id}/chapters/reorder`,
                                method: "POST",
                                body: {
                                  orderedIds: move(
                                    act.chapters.map((item) => item.id),
                                    chapterIndex,
                                    -1,
                                  ),
                                },
                              })
                            }
                          >
                            <ArrowUp size={10} />
                          </button>
                          <button
                            type="button"
                            title="Move Chapter down"
                            onClick={() =>
                              mutateTree.mutate({
                                path: `/api/acts/${act.id}/chapters/reorder`,
                                method: "POST",
                                body: {
                                  orderedIds: move(
                                    act.chapters.map((item) => item.id),
                                    chapterIndex,
                                    1,
                                  ),
                                },
                              })
                            }
                          >
                            <ArrowDown size={10} />
                          </button>
                          <button
                            type="button"
                            title="Rename Chapter"
                            onClick={() => rename(`/api/chapters/${chapter.id}`, chapter.title)}
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            type="button"
                            title="Delete Chapter"
                            onClick={() => remove(`/api/chapters/${chapter.id}`, chapter.title)}
                          >
                            <Trash2 size={10} />
                          </button>
                        </span>
                        <button type="button" onClick={() => createScene.mutate(chapter.id)}>
                          <Plus size={13} />
                        </button>
                      </div>
                      {chapter.scenes.map((scene, sceneIndex) => (
                        <div key={scene.id} className="tree-scene-row">
                          <button
                            type="button"
                            className={
                              scene.id === selectedSceneId ? "tree-scene active" : "tree-scene"
                            }
                            onClick={() => {
                              setSelectedSceneId(scene.id);
                              setScope(null);
                            }}
                          >
                            {scene.title}
                          </button>
                          <span className="tree-actions">
                            <button
                              type="button"
                              title="Move Scene up"
                              onClick={() =>
                                mutateTree.mutate({
                                  path: `/api/chapters/${chapter.id}/scenes/reorder`,
                                  method: "POST",
                                  body: {
                                    orderedIds: move(
                                      chapter.scenes.map((item) => item.id),
                                      sceneIndex,
                                      -1,
                                    ),
                                  },
                                })
                              }
                            >
                              <ArrowUp size={10} />
                            </button>
                            <button
                              type="button"
                              title="Move Scene down"
                              onClick={() =>
                                mutateTree.mutate({
                                  path: `/api/chapters/${chapter.id}/scenes/reorder`,
                                  method: "POST",
                                  body: {
                                    orderedIds: move(
                                      chapter.scenes.map((item) => item.id),
                                      sceneIndex,
                                      1,
                                    ),
                                  },
                                })
                              }
                            >
                              <ArrowDown size={10} />
                            </button>
                            <button
                              type="button"
                              title="Rename Scene"
                              onClick={() =>
                                rename(`/api/scenes/${scene.id}`, scene.title, {
                                  expectedVersion: scene.version,
                                })
                              }
                            >
                              <Pencil size={10} />
                            </button>
                            <button
                              type="button"
                              title="Delete Scene"
                              onClick={() => remove(`/api/scenes/${scene.id}`, scene.title)}
                            >
                              <Trash2 size={10} />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </aside>
          ) : (
            <CompendiumPanel
              projectId={projectId}
              entries={compendium.data ?? []}
              selectedEntryId={selectedEntryId}
              onSelect={setSelectedEntryId}
              onShowManuscript={() => setSidebar("manuscript")}
            />
          )}
          <div className="manuscript-main">
            {scope ? (
              <ContinuousManuscriptView
                tree={tree.data}
                scope={scope}
                entries={compendium.data ?? []}
                onEditScene={(sceneId) => {
                  setSelectedSceneId(sceneId);
                  setScope(null);
                }}
                onOpenEntry={(entryIds, direct) => {
                  if (direct && entryIds.length === 1) {
                    setSelectedEntryId(entryIds[0] ?? null);
                    setSidebar("compendium");
                    setScope(null);
                  } else {
                    setPreviewEntryIds(entryIds);
                  }
                }}
              />
            ) : selectedScene ? (
              <SceneEditor
                key={selectedScene.id}
                initialScene={selectedScene}
                entries={compendium.data ?? []}
                baseModel={settings.data?.baseModel ?? "asterism/fake-prose"}
                models={models.data ?? [{ id: "asterism/fake-prose", name: "Asterism Fake Prose" }]}
                onSaved={(scene) =>
                  client.setQueryData<ManuscriptTree>(["project-tree", projectId], (current) =>
                    current
                      ? {
                          ...current,
                          acts: current.acts.map((act) => ({
                            ...act,
                            chapters: act.chapters.map((chapter) => ({
                              ...chapter,
                              scenes: chapter.scenes.map((item) =>
                                item.id === scene.id ? scene : item,
                              ),
                            })),
                          })),
                        }
                      : current,
                  )
                }
                onOpenEntry={(entryIds, direct) => {
                  if (direct && entryIds.length === 1) {
                    setSelectedEntryId(entryIds[0] ?? null);
                    setSidebar("compendium");
                  } else {
                    setPreviewEntryIds(entryIds);
                  }
                }}
              />
            ) : (
              <div className="empty-editor">
                <Users size={30} />
                <h2>Create a Scene to begin</h2>
              </div>
            )}
            {sidebar === "compendium" ? (
              <CompendiumEntryDrawer
                projectId={projectId}
                entry={
                  (compendium.data ?? []).find((entry) => entry.id === selectedEntryId) ?? null
                }
                mentionCount={selectedEntryMentionCount}
                onClose={() => setSelectedEntryId(null)}
              />
            ) : null}
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
                        setSidebar("compendium");
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
