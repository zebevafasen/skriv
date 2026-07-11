import type {
  CompendiumEntry,
  ManuscriptTree,
  Scene,
  SceneLabelColor,
  SceneMetadata,
} from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  GripVertical,
  MoreVertical,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./AppShell.js";
import { useAppDialog } from "./DialogProvider.js";

const labelColors: SceneLabelColor[] = [
  "amber",
  "orange",
  "red",
  "rose",
  "pink",
  "violet",
  "purple",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "stone",
  "slate",
];

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

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

function SortableBox({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className}${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(
        <button
          type="button"
          className="outline-drag-handle"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>,
      )}
    </div>
  );
}

function SceneCard({
  scene,
  entries,
  labelSuggestions,
  onOpenScene,
  onOpenEntry,
  onUpdated,
  onRename,
  onDelete,
  dragHandle,
}: {
  scene: Scene;
  entries: CompendiumEntry[];
  labelSuggestions: Array<{ text: string; color: SceneLabelColor }>;
  onOpenScene: (sceneId: string) => void;
  onOpenEntry: (entryIds: string[]) => void;
  onUpdated: (scene: Scene) => void;
  onRename: () => void;
  onDelete: () => void;
  dragHandle: ReactNode;
}) {
  const [metadata, setMetadata] = useState(scene.metadata);
  const [labelInput, setLabelInput] = useState("");
  const [labelColor, setLabelColor] = useState<SceneLabelColor>("amber");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "conflict">("saved");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const version = useRef(scene.version);
  const metadataRef = useRef(scene.metadata);

  useEffect(() => {
    if (scene.version < version.current) return;
    version.current = scene.version;
    metadataRef.current = scene.metadata;
    setMetadata(scene.metadata);
  }, [scene]);

  const persist = async (next: SceneMetadata = metadataRef.current, updateUi = true) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (updateUi) setSaveState("saving");
    try {
      const updated = await api<Scene>(`/api/scenes/${scene.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: version.current, metadata: next }),
      });
      version.current = updated.version;
      metadataRef.current = updated.metadata;
      if (updateUi) {
        setMetadata(updated.metadata);
        setSaveState("saved");
      }
      onUpdated(updated);
      return updated;
    } catch (saveError) {
      if (updateUi) {
        setError(saveError);
        setSaveState("conflict");
      }
      return null;
    }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const changeMetadata = (next: SceneMetadata) => {
    metadataRef.current = next;
    setMetadata(next);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 800);
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void persistRef.current(metadataRef.current, false);
      }
    },
    [],
  );

  const mentionedIds = useMemo(
    () => [...new Set(findMentions(scene.plainText, entries).flatMap((match) => match.entryIds))],
    [entries, scene.plainText],
  );
  const characters = entries.filter((entry) => entry.typeId === "story.character");
  const locations = entries.filter((entry) => entry.typeId === "story.location");

  const addLabel = (raw: string, color = labelColor) => {
    const text = raw.trim();
    if (!text || metadata.labels.length >= 24) return;
    if (
      metadata.labels.some((label) => label.text.toLocaleLowerCase() === text.toLocaleLowerCase())
    )
      return;
    changeMetadata({
      ...metadata,
      labels: [...metadata.labels, { id: crypto.randomUUID(), text, color }],
    });
    setLabelInput("");
  };

  return (
    <article
      className="outline-scene-card"
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest("button, select, input")) {
          event.currentTarget.querySelector("textarea")?.focus();
        }
      }}
    >
      <header>
        {dragHandle}
        <strong>{scene.title}</strong>
        <span>{wordCount(scene.plainText)} words</span>
        <button
          type="button"
          className="icon-button"
          aria-label={`Rename ${scene.title}`}
          onClick={onRename}
        >
          <MoreVertical size={14} />
        </button>
        <button
          type="button"
          className="icon-button danger scene-card-delete"
          aria-label={`Delete ${scene.title}`}
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
      </header>
      <textarea
        aria-label={`${scene.title} summary`}
        value={metadata.summary}
        onChange={(event) => changeMetadata({ ...metadata, summary: event.target.value })}
        placeholder="Add summary…"
      />
      <div className="outline-scene-meta-grid">
        <label>
          <span>Status</span>
          <select
            value={metadata.status}
            onChange={(event) =>
              changeMetadata({
                ...metadata,
                status: event.target.value as SceneMetadata["status"],
              })
            }
          >
            <option value="draft">Draft</option>
            <option value="revising">Revising</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label>
          <span>POV</span>
          <select
            value={metadata.povEntryId ?? ""}
            onChange={(event) =>
              changeMetadata({ ...metadata, povEntryId: event.target.value || null })
            }
          >
            <option value="">None</option>
            {characters.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select
            value={metadata.locationEntryId ?? ""}
            onChange={(event) =>
              changeMetadata({ ...metadata, locationEntryId: event.target.value || null })
            }
          >
            <option value="">None</option>
            {locations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Add character</span>
          <select
            value=""
            onChange={(event) => {
              if (
                !event.target.value ||
                metadata.presentCharacterEntryIds.includes(event.target.value)
              )
                return;
              changeMetadata({
                ...metadata,
                presentCharacterEntryIds: [
                  ...metadata.presentCharacterEntryIds,
                  event.target.value,
                ],
              });
            }}
          >
            <option value="">Choose…</option>
            {characters.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {metadata.presentCharacterEntryIds.length ? (
        <div className="outline-character-chips">
          {metadata.presentCharacterEntryIds.map((id) => {
            const entry = entries.find((candidate) => candidate.id === id);
            return entry ? (
              <button
                type="button"
                key={id}
                onClick={() =>
                  changeMetadata({
                    ...metadata,
                    presentCharacterEntryIds: metadata.presentCharacterEntryIds.filter(
                      (candidate) => candidate !== id,
                    ),
                  })
                }
              >
                {entry.name} ×
              </button>
            ) : null;
          })}
        </div>
      ) : null}
      {mentionedIds.length ? (
        <div className="outline-compendium-chips">
          {mentionedIds.map((id) => {
            const entry = entries.find((candidate) => candidate.id === id);
            return entry ? (
              <button type="button" key={id} onClick={() => onOpenEntry([id])}>
                {entry.name}
              </button>
            ) : null;
          })}
        </div>
      ) : null}
      <div className="outline-labels">
        {metadata.labels.map((label) => (
          <button
            type="button"
            key={label.id}
            className={`scene-label color-${label.color}`}
            title="Remove label"
            onClick={() =>
              changeMetadata({
                ...metadata,
                labels: metadata.labels.filter((candidate) => candidate.id !== label.id),
              })
            }
          >
            {label.text} ×
          </button>
        ))}
      </div>
      <div className="outline-label-input">
        <input
          value={labelInput}
          list={`scene-labels-${scene.id}`}
          placeholder="Add label…"
          onChange={(event) => setLabelInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const suggestion = labelSuggestions.find(
                (candidate) =>
                  candidate.text.toLocaleLowerCase() === labelInput.toLocaleLowerCase(),
              );
              addLabel(labelInput, suggestion?.color ?? labelColor);
            }
          }}
        />
        <datalist id={`scene-labels-${scene.id}`}>
          {labelSuggestions.map((label) => (
            <option value={label.text} key={label.text} />
          ))}
        </datalist>
        <select
          aria-label="Label color"
          className={`label-color-select color-${labelColor}`}
          value={labelColor}
          onChange={(event) => setLabelColor(event.target.value as SceneLabelColor)}
        >
          {labelColors.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
        <button type="button" className="icon-button" onClick={() => addLabel(labelInput)}>
          <Plus size={13} />
        </button>
      </div>
      <footer>
        <span className={`outline-save-state ${saveState}`}>{saveState}</span>
        <button
          type="button"
          className="button ghost"
          disabled={generating || !scene.plainText.trim() || saveState === "conflict"}
          onClick={async () => {
            setGenerating(true);
            setError(null);
            const saved = saveState === "saving" ? await persist() : null;
            const expectedVersion = saved?.version ?? version.current;
            try {
              const updated = await api<Scene>(`/api/scenes/${scene.id}/summary/generate`, {
                method: "POST",
                body: JSON.stringify({
                  expectedVersion,
                  modelOverride: localStorage.getItem("asterism-latest-model"),
                }),
              });
              version.current = updated.version;
              metadataRef.current = updated.metadata;
              setMetadata(updated.metadata);
              setSaveState("saved");
              onUpdated(updated);
            } catch (generationError) {
              setError(generationError);
            } finally {
              setGenerating(false);
            }
          }}
        >
          <Sparkles size={13} /> {generating ? "Summarizing…" : "Summarize"}
        </button>
        <button type="button" className="button ghost" onClick={() => onOpenScene(scene.id)}>
          <ExternalLink size={13} /> Open Scene
        </button>
      </footer>
      {error ? <ErrorNotice error={error} /> : null}
    </article>
  );
}

export function OutlineGrid({
  projectId,
  tree,
  entries,
  onOpenScene,
  onOpenEntry,
}: {
  projectId: string;
  tree: ManuscriptTree;
  entries: CompendiumEntry[];
  onOpenScene: (sceneId: string) => void;
  onOpenEntry: (entryIds: string[]) => void;
}) {
  const dialog = useAppDialog();
  const client = useQueryClient();
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<unknown>(null);
  const hierarchyKeyboardCoordinates = useCallback<KeyboardCoordinateGetter>(
    (event, args) => {
      const activeId = String(args.active);
      let siblings = tree.acts.map((act) => act.id);
      let horizontal = false;
      for (const act of tree.acts) {
        const chapterIds = act.chapters.map((chapter) => chapter.id);
        if (chapterIds.includes(activeId)) {
          siblings = chapterIds;
          horizontal = true;
        }
        for (const chapter of act.chapters) {
          const sceneIds = chapter.scenes.map((scene) => scene.id);
          if (sceneIds.includes(activeId)) {
            siblings = sceneIds;
            horizontal = false;
          }
        }
      }
      const direction =
        event.code === (horizontal ? "ArrowRight" : "ArrowDown")
          ? 1
          : event.code === (horizontal ? "ArrowLeft" : "ArrowUp")
            ? -1
            : 0;
      if (!direction) return sortableKeyboardCoordinates(event, args);
      const targetId = siblings[siblings.indexOf(activeId) + direction];
      const targetRect = targetId ? args.context.droppableRects.get(targetId) : null;
      if (!targetRect) return args.currentCoordinates;
      return {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      };
    },
    [tree],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: hierarchyKeyboardCoordinates }),
  );
  const labelSuggestions = useMemo(() => {
    const labels = new Map<string, { text: string; color: SceneLabelColor }>();
    for (const scene of tree.acts.flatMap((act) =>
      act.chapters.flatMap((chapter) => chapter.scenes),
    )) {
      for (const label of scene.metadata.labels) {
        labels.set(label.text.toLocaleLowerCase(), { text: label.text, color: label.color });
      }
    }
    return [...labels.values()];
  }, [tree]);
  const hierarchyCollisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeId = String(args.active.id);
      let allowed = new Set(tree.acts.map((act) => act.id));
      for (const act of tree.acts) {
        const chapterIds = act.chapters.map((chapter) => chapter.id);
        if (chapterIds.includes(activeId)) allowed = new Set(chapterIds);
        for (const chapter of act.chapters) {
          const sceneIds = chapter.scenes.map((scene) => scene.id);
          if (sceneIds.includes(activeId)) allowed = new Set(sceneIds);
        }
      }
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) =>
          allowed.has(String(container.id)),
        ),
      });
    },
    [tree],
  );

  const setTree = (next: ManuscriptTree) =>
    client.setQueryData<ManuscriptTree>(["project-tree", projectId], next);
  const reorder = async (
    path: string,
    ids: string[],
    activeId: string,
    overId: string,
    apply: (orderedIds: string[]) => ManuscriptTree,
  ) => {
    const oldIndex = ids.indexOf(activeId);
    const newIndex = ids.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const orderedIds = arrayMove(ids, oldIndex, newIndex);
    const previous = tree;
    setTree(apply(orderedIds));
    try {
      await api(path, { method: "POST", body: JSON.stringify({ orderedIds }) });
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    } catch (reorderError) {
      setTree(previous);
      setError(reorderError);
    }
  };
  const create = async (path: string, title: string) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify({ title }) });
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    } catch (createError) {
      setError(createError);
    }
  };
  const rename = async (path: string, title: string, body: object = {}) => {
    const next = (
      await dialog.prompt({ title: "Rename", label: "Title", initialValue: title })
    )?.trim();
    if (!next || next === title) return;
    try {
      await api(path, { method: "PATCH", body: JSON.stringify({ ...body, title: next }) });
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    } catch (renameError) {
      setError(renameError);
    }
  };
  const remove = async (path: string, title: string) => {
    if (
      !(await dialog.confirm({
        title: `Delete ${title}?`,
        body: "This permanently deletes this item and all of its contents. This cannot be undone.",
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      await api(path, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    } catch (removeError) {
      setError(removeError);
    }
  };

  return (
    <section className="outline-grid" aria-label="Story outline">
      <header className="outline-grid-heading">
        <div>
          <p className="eyebrow">Planning grid</p>
          <h2>Outline</h2>
        </div>
      </header>
      {error ? <ErrorNotice error={error} /> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={hierarchyCollisionDetection}
        onDragEnd={({ active, over }) => {
          if (!over) return;
          const activeId = String(active.id);
          const overId = String(over.id);
          const actIds = tree.acts.map((act) => act.id);
          if (actIds.includes(activeId) && actIds.includes(overId)) {
            void reorder(
              `/api/projects/${projectId}/acts/reorder`,
              actIds,
              activeId,
              overId,
              (ids) => ({
                ...tree,
                acts: ids.map((id, position) => ({
                  ...(tree.acts.find((act) => act.id === id) as (typeof tree.acts)[number]),
                  position,
                })),
              }),
            );
            return;
          }
          for (const act of tree.acts) {
            const chapterIds = act.chapters.map((chapter) => chapter.id);
            if (chapterIds.includes(activeId) && chapterIds.includes(overId)) {
              void reorder(
                `/api/acts/${act.id}/chapters/reorder`,
                chapterIds,
                activeId,
                overId,
                (ids) => ({
                  ...tree,
                  acts: tree.acts.map((candidate) =>
                    candidate.id === act.id
                      ? {
                          ...candidate,
                          chapters: ids.map((id, position) => ({
                            ...(act.chapters.find(
                              (chapter) => chapter.id === id,
                            ) as (typeof act.chapters)[number]),
                            position,
                          })),
                        }
                      : candidate,
                  ),
                }),
              );
              return;
            }
            for (const chapter of act.chapters) {
              const sceneIds = chapter.scenes.map((scene) => scene.id);
              if (sceneIds.includes(activeId) && sceneIds.includes(overId)) {
                void reorder(
                  `/api/chapters/${chapter.id}/scenes/reorder`,
                  sceneIds,
                  activeId,
                  overId,
                  (ids) => ({
                    ...tree,
                    acts: tree.acts.map((candidateAct) => ({
                      ...candidateAct,
                      chapters: candidateAct.chapters.map((candidateChapter) =>
                        candidateChapter.id === chapter.id
                          ? {
                              ...candidateChapter,
                              scenes: ids.map((id, position) => ({
                                ...(chapter.scenes.find((scene) => scene.id === id) as Scene),
                                position,
                              })),
                            }
                          : candidateChapter,
                      ),
                    })),
                  }),
                );
                return;
              }
            }
          }
        }}
      >
        <SortableContext
          items={tree.acts.map((act) => act.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="outline-acts">
            {tree.acts.map((act) => {
              const actWords = act.chapters.reduce(
                (sum, chapter) =>
                  sum +
                  chapter.scenes.reduce(
                    (sceneSum, scene) => sceneSum + wordCount(scene.plainText),
                    0,
                  ),
                0,
              );
              return (
                <SortableBox id={act.id} className="outline-act" key={act.id}>
                  {(actHandle) => (
                    <>
                      <header className="outline-act-heading">
                        {actHandle}
                        <button
                          type="button"
                          className="outline-collapse"
                          onClick={() =>
                            setCollapsedActs((current) => {
                              const next = new Set(current);
                              if (next.has(act.id)) next.delete(act.id);
                              else next.add(act.id);
                              return next;
                            })
                          }
                        >
                          <ChevronDown
                            className={collapsedActs.has(act.id) ? "collapsed" : ""}
                            size={15}
                          />
                          <strong>{act.title}</strong>
                        </button>
                        <span>
                          {act.chapters.length} chapters · {actWords} words
                        </span>
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() => void create(`/api/acts/${act.id}/chapters`, "New Chapter")}
                        >
                          <Plus size={13} /> Chapter
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => void rename(`/api/acts/${act.id}`, act.title)}
                          aria-label={`Rename ${act.title}`}
                        >
                          <MoreVertical size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => void remove(`/api/acts/${act.id}`, act.title)}
                          aria-label={`Delete ${act.title}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </header>
                      {!collapsedActs.has(act.id) ? (
                        <SortableContext
                          items={act.chapters.map((chapter) => chapter.id)}
                          strategy={horizontalListSortingStrategy}
                        >
                          <div className="outline-chapters">
                            {act.chapters.map((chapter) => (
                              <SortableBox
                                id={chapter.id}
                                className="outline-chapter"
                                key={chapter.id}
                              >
                                {(chapterHandle) => (
                                  <>
                                    <header>
                                      {chapterHandle}
                                      <strong>{chapter.title}</strong>
                                      <span>
                                        {chapter.scenes.reduce(
                                          (sum, scene) => sum + wordCount(scene.plainText),
                                          0,
                                        )}{" "}
                                        words
                                      </span>
                                      <button
                                        type="button"
                                        className="icon-button"
                                        onClick={() =>
                                          void rename(`/api/chapters/${chapter.id}`, chapter.title)
                                        }
                                        aria-label={`Rename ${chapter.title}`}
                                      >
                                        <MoreVertical size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-button danger"
                                        onClick={() =>
                                          void remove(`/api/chapters/${chapter.id}`, chapter.title)
                                        }
                                        aria-label={`Delete ${chapter.title}`}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </header>
                                    <SortableContext
                                      items={chapter.scenes.map((scene) => scene.id)}
                                      strategy={verticalListSortingStrategy}
                                    >
                                      <div className="outline-scenes">
                                        {chapter.scenes.map((scene) => (
                                          <SortableBox
                                            id={scene.id}
                                            className="outline-scene-sortable"
                                            key={scene.id}
                                          >
                                            {(sceneHandle) => (
                                              <SceneCard
                                                scene={scene}
                                                entries={entries}
                                                labelSuggestions={labelSuggestions}
                                                onOpenScene={onOpenScene}
                                                onOpenEntry={onOpenEntry}
                                                onUpdated={(updated) =>
                                                  setTree(updateScene(tree, updated))
                                                }
                                                onRename={() =>
                                                  void rename(
                                                    `/api/scenes/${scene.id}`,
                                                    scene.title,
                                                    { expectedVersion: scene.version },
                                                  )
                                                }
                                                onDelete={() =>
                                                  void remove(
                                                    `/api/scenes/${scene.id}`,
                                                    scene.title,
                                                  )
                                                }
                                                dragHandle={sceneHandle}
                                              />
                                            )}
                                          </SortableBox>
                                        ))}
                                      </div>
                                    </SortableContext>
                                    <button
                                      type="button"
                                      className="outline-add-scene"
                                      onClick={() =>
                                        void create(
                                          `/api/chapters/${chapter.id}/scenes`,
                                          "New Scene",
                                        )
                                      }
                                    >
                                      <Plus size={13} /> New Scene
                                    </button>
                                  </>
                                )}
                              </SortableBox>
                            ))}
                          </div>
                        </SortableContext>
                      ) : null}
                    </>
                  )}
                </SortableBox>
              );
            })}
            <div>
              <button
                type="button"
                className="button primary"
                onClick={() => void create(`/api/projects/${projectId}/acts`, "New Act")}
              >
                <Plus size={14} /> New Act
              </button>
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
