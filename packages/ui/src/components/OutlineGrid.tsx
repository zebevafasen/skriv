import type {
  CompendiumCategory,
  CompendiumEntry,
  CreateManuscriptItemInput,
  ManuscriptTree,
  Scene,
  SceneLabelDefinition,
  SceneLabelColor,
  SceneLabelPack,
  SceneMetadata,
} from "@asterism/contracts";
import { findMentions, manuscriptLabels } from "@asterism/core";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  GripVertical,
  MoreVertical,
  Plus,
  Settings2,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { asterism } from "../api.js";
import {
  editableLabelColors,
  findLabelDefinition,
  projectLabelLibrary,
  safeLabelColor,
} from "../utils/sceneLabelPacks.js";
import { updateSceneInTree } from "../utils/manuscript.js";
import { ErrorNotice } from "./AppShell.js";
import { useAppDialog } from "./DialogProvider.js";
import { LabelPackManager } from "./LabelPackManager.js";

const compendiumTypeOrder = [
  "story.character",
  "story.location",
  "story.object",
  "story.faction",
  "story.lore",
  "story.other",
] as const;

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
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
  aiConfigured,
  scene,
  displayLabel,
  entries,
  labelPacks,
  onOpenScene,
  onOpenEntry,
  onManageLabels,
  onCreateQuickLabel,
  onUpdated,
  onRename,
  onDelete,
  dragHandle,
}: {
  aiConfigured: boolean;
  scene: Scene;
  displayLabel: string;
  entries: CompendiumEntry[];
  labelPacks: SceneLabelPack[];
  onOpenScene: (sceneId: string) => void;
  onOpenEntry: (entryIds: string[]) => void;
  onManageLabels: () => void;
  onCreateQuickLabel: (
    name: string,
    color: SceneLabelColor,
  ) => Promise<{ pack: SceneLabelPack; definition: SceneLabelDefinition }>;
  onUpdated: (scene: Scene) => void;
  onRename: () => void;
  onDelete: () => void;
  dragHandle: ReactNode;
}) {
  const [metadata, setMetadata] = useState(scene.metadata);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [labelMenuPosition, setLabelMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [quickLabelName, setQuickLabelName] = useState("");
  const [quickLabelColor, setQuickLabelColor] = useState<SceneLabelColor>("blue");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "conflict">("saved");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelMenuRef = useRef<HTMLDivElement>(null);
  const labelButtonRef = useRef<HTMLButtonElement>(null);
  const labelPopoverRef = useRef<HTMLDivElement>(null);
  const version = useRef(scene.version);
  const metadataRef = useRef(scene.metadata);

  useEffect(() => {
    if (scene.version < version.current) return;
    version.current = scene.version;
    metadataRef.current = scene.metadata;
    setMetadata(scene.metadata);
  }, [scene]);

  useEffect(() => {
    if (!labelMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!labelMenuRef.current?.contains(target) && !labelPopoverRef.current?.contains(target)) {
        setLabelMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLabelMenuOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [labelMenuOpen]);

  useEffect(() => {
    if (!labelMenuOpen) {
      setLabelMenuPosition(null);
      return;
    }

    const positionMenu = () => {
      const button = labelButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const edge = 12;
      const gap = 8;
      const width = Math.min(330, window.innerWidth - edge * 2);
      const spaceAbove = Math.max(0, rect.top - edge - gap);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - edge - gap);
      const openBelow = spaceBelow >= spaceAbove;
      const maxHeight = Math.min(410, openBelow ? spaceBelow : spaceAbove);
      const left = Math.min(
        Math.max(edge, rect.left),
        Math.max(edge, window.innerWidth - width - edge),
      );
      const top = openBelow ? rect.bottom + gap : Math.max(edge, rect.top - gap - maxHeight);

      setLabelMenuPosition({ top, left, width, maxHeight });
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [labelMenuOpen]);

  const persist = async (next: SceneMetadata = metadataRef.current, updateUi = true) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (updateUi) setSaveState("saving");
    try {
      const updated = await asterism().manuscript.updateScene(scene.id, {
        expectedVersion: version.current,
        metadata: next,
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

  const mentionedIds = useMemo(() => {
    const ids = new Set(findMentions(scene.plainText, entries).flatMap((match) => match.entryIds));
    return entries.filter((entry) => ids.has(entry.id)).map((entry) => entry.id);
  }, [entries, scene.plainText]);

  const toggleLabel = (pack: SceneLabelPack, definition: SceneLabelDefinition) => {
    const active = metadata.labels.some((label) => {
      const resolved = findLabelDefinition(labelPacks, label);
      return resolved?.definition.id === definition.id;
    });
    const packDefinitionIds = new Set(pack.labels.map((label) => label.id));
    const withoutPack = metadata.labels.filter((label) => {
      const resolved = findLabelDefinition(labelPacks, label);
      return !resolved || !packDefinitionIds.has(resolved.definition.id);
    });
    changeMetadata({
      ...metadata,
      labels: active
        ? withoutPack
        : [
            ...withoutPack,
            {
              id: crypto.randomUUID(),
              definitionId: definition.id,
              text: definition.name,
              color: definition.color,
            },
          ],
    });
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
        <strong>{displayLabel}</strong>
        <span>{wordCount(scene.plainText)} words</span>
        <button
          ref={labelButtonRef}
          type="button"
          className="icon-button"
          aria-label={`Rename ${displayLabel}`}
          onClick={onRename}
        >
          <MoreVertical size={14} />
        </button>
        <button
          type="button"
          className="icon-button danger scene-card-delete"
          aria-label={`Delete ${displayLabel}`}
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
      </header>
      <textarea
        aria-label={`${displayLabel} summary`}
        value={metadata.summary}
        onChange={(event) => changeMetadata({ ...metadata, summary: event.target.value })}
        placeholder="Add summary…"
      />
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
      {metadata.labels.length ? (
        <div className="outline-labels">
          {metadata.labels.map((label) => {
            const resolved = findLabelDefinition(labelPacks, label);
            const name = resolved?.definition.name ?? label.text;
            const color = safeLabelColor(resolved?.definition.color ?? label.color);
            return (
              <button
                type="button"
                key={label.id}
                className={`scene-label color-${color}`}
                title="Remove label"
                onClick={() =>
                  changeMetadata({
                    ...metadata,
                    labels: metadata.labels.filter((candidate) => candidate.id !== label.id),
                  })
                }
              >
                {name} <span aria-hidden="true">×</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="outline-label-actions" ref={labelMenuRef}>
        <button
          type="button"
          className="button ghost outline-label-button"
          aria-haspopup="menu"
          aria-expanded={labelMenuOpen}
          onClick={() => setLabelMenuOpen((current) => !current)}
        >
          <Tags size={12} /> Label
          {metadata.labels.length ? <span>{metadata.labels.length}</span> : null}
        </button>
        {labelMenuOpen && labelMenuPosition
          ? createPortal(
              <div
                ref={labelPopoverRef}
                className="outline-label-menu"
                role="menu"
                aria-label={`Labels for ${displayLabel}`}
                style={labelMenuPosition}
              >
                <header>
                  <strong>Add a label</strong>
                  <span>One choice per pack</span>
                </header>
                <div className="outline-label-menu-packs">
                  {labelPacks.map((pack) => (
                    <section key={pack.id}>
                      <div>
                        <strong>{pack.name}</strong>
                        <small>{pack.ownership === "builtin" ? "BUILTIN" : "CUSTOM"}</small>
                      </div>
                      {pack.labels.length ? (
                        <div className="outline-label-options">
                          {pack.labels.map((definition) => {
                            const active = metadata.labels.some(
                              (label) =>
                                findLabelDefinition(labelPacks, label)?.definition.id ===
                                definition.id,
                            );
                            return (
                              <button
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={active}
                                className={`scene-label color-${safeLabelColor(definition.color)}${active ? " active" : ""}`}
                                key={definition.id}
                                onClick={() => toggleLabel(pack, definition)}
                              >
                                {definition.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p>No labels yet.</p>
                      )}
                    </section>
                  ))}
                </div>
                <div className="outline-quick-label">
                  <input
                    value={quickLabelName}
                    maxLength={60}
                    placeholder="Quick label…"
                    onChange={(event) => setQuickLabelName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && quickLabelName.trim()) {
                        event.preventDefault();
                        void onCreateQuickLabel(quickLabelName, quickLabelColor).then(
                          ({ pack, definition }) => {
                            toggleLabel(pack, definition);
                            setQuickLabelName("");
                          },
                          setError,
                        );
                      }
                    }}
                  />
                  <select
                    aria-label="Quick label color"
                    value={quickLabelColor}
                    onChange={(event) => setQuickLabelColor(event.target.value as SceneLabelColor)}
                  >
                    {editableLabelColors.map((color) => (
                      <option value={color} key={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Create quick label"
                    disabled={!quickLabelName.trim()}
                    onClick={() =>
                      void onCreateQuickLabel(quickLabelName, quickLabelColor).then(
                        ({ pack, definition }) => {
                          toggleLabel(pack, definition);
                          setQuickLabelName("");
                        },
                        setError,
                      )
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  className="outline-manage-labels"
                  onClick={() => {
                    setLabelMenuOpen(false);
                    onManageLabels();
                  }}
                >
                  <Settings2 size={14} /> Manage labels and packs
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>
      <footer>
        <span className={`outline-save-state ${saveState}`}>{saveState}</span>
        <button
          type="button"
          className="button ghost"
          disabled={
            !aiConfigured || generating || !scene.plainText.trim() || saveState === "conflict"
          }
          title={aiConfigured ? "Generate a Scene summary" : "Configure OpenRouter in Settings"}
          onClick={async () => {
            setGenerating(true);
            setError(null);
            const saved = saveState === "saving" ? await persist() : null;
            const expectedVersion = saved?.version ?? version.current;
            try {
              const updated = await asterism().manuscript.generateSummary(scene.id, {
                expectedVersion,
                modelOverride: localStorage.getItem("asterism-latest-model"),
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
  aiConfigured,
  projectId,
  tree,
  entries,
  onOpenScene,
  onOpenEntry,
}: {
  aiConfigured: boolean;
  projectId: string;
  tree: ManuscriptTree;
  entries: CompendiumEntry[];
  onOpenScene: (sceneId: string) => void;
  onOpenEntry: (entryIds: string[]) => void;
}) {
  const dialog = useAppDialog();
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ["compendium-categories", projectId],
    queryFn: () => asterism().compendium.categories(projectId),
  });
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(() => new Set());
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(() => new Set());
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
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
  const allScenes = useMemo(
    () => tree.acts.flatMap((act) => act.chapters.flatMap((chapter) => chapter.scenes)),
    [tree],
  );
  const legacyLabels = useMemo(
    () => allScenes.flatMap((scene) => scene.metadata.labels),
    [allScenes],
  );
  const labelLibrary = useMemo(
    () => projectLabelLibrary(tree.project.settings.labelPacks, legacyLabels),
    [legacyLabels, tree.project.settings.labelPacks],
  );
  const orderedEntries = useMemo(() => {
    const typeRank = (typeId: string, customCategories: CompendiumCategory[]) => {
      const standard = compendiumTypeOrder.indexOf(typeId as (typeof compendiumTypeOrder)[number]);
      if (standard >= 0) return standard;
      if (typeId.startsWith("custom.")) {
        const custom = customCategories.findIndex(
          (category) => category.id === typeId.slice("custom.".length),
        );
        if (custom >= 0) return compendiumTypeOrder.length + custom;
      }
      return compendiumTypeOrder.length + customCategories.length + 1;
    };
    return [...entries].sort((left, right) => {
      const rank =
        typeRank(left.typeId, categories.data ?? []) -
        typeRank(right.typeId, categories.data ?? []);
      return rank || left.name.localeCompare(right.name);
    });
  }, [categories.data, entries]);
  const structureLabels = useMemo(() => manuscriptLabels(tree), [tree]);
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
  const createQuickLabel = async (name: string, color: SceneLabelColor) => {
    const normalized = name.trim().toLocaleLowerCase();
    const existing = labelLibrary.allPacks
      .flatMap((pack) => pack.labels.map((definition) => ({ pack, definition })))
      .find(({ definition }) => definition.name.toLocaleLowerCase() === normalized);
    if (existing) return existing;
    const definition: SceneLabelDefinition = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color: safeLabelColor(color),
    };
    const userPacks = labelLibrary.userPacks.map((pack) =>
      pack.id === "user.default" ? { ...pack, labels: [...pack.labels, definition] } : pack,
    );
    await asterism().projects.update(projectId, { settings: { labelPacks: userPacks } });
    await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    const pack = userPacks.find((candidate) => candidate.id === "user.default");
    if (!pack) throw new Error("The default label pack is unavailable.");
    return { pack, definition };
  };
  const reorder = async (
    operation: (orderedIds: string[]) => Promise<void>,
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
      await operation(orderedIds);
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    } catch (reorderError) {
      setTree(previous);
      setError(reorderError);
    }
  };
  const create = async (input: CreateManuscriptItemInput) => {
    try {
      const created = await asterism().manuscript.createItem(projectId, input);
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
      onOpenScene(created.initialSceneId);
    } catch (createError) {
      setError(createError);
    }
  };
  const rename = async (
    kind: "act" | "chapter" | "scene",
    id: string,
    title: string,
    body: object = {},
  ) => {
    const result = await dialog.prompt({
      title: "Edit custom title",
      label: "Optional title",
      initialValue: title,
    });
    if (result === null) return;
    const next = result.trim();
    if (next === title) return;
    try {
      await asterism().manuscript.updateItem(kind, id, { ...body, title: next });
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    } catch (renameError) {
      setError(renameError);
    }
  };
  const remove = async (kind: "act" | "chapter" | "scene", id: string, title: string) => {
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
      await asterism().manuscript.removeItem(kind, id);
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
              (orderedIds) => asterism().manuscript.reorderActs(projectId, orderedIds),
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
                (orderedIds) => asterism().manuscript.reorderChapters(act.id, orderedIds),
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
                  (orderedIds) => asterism().manuscript.reorderScenes(chapter.id, orderedIds),
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
                          <strong>{structureLabels.acts.get(act.id)?.label}</strong>
                        </button>
                        <span>
                          {act.chapters.length} chapters · {actWords} words
                        </span>
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() =>
                            void create({
                              kind: "chapter",
                              actId: act.id,
                              afterChapterId: act.chapters.at(-1)?.id ?? null,
                            })
                          }
                        >
                          <Plus size={13} /> Chapter
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => void rename("act", act.id, act.title)}
                          aria-label={`Rename ${structureLabels.acts.get(act.id)?.label}`}
                        >
                          <MoreVertical size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() =>
                            void remove(
                              "act",
                              act.id,
                              structureLabels.acts.get(act.id)?.label ?? "Act",
                            )
                          }
                          aria-label={`Delete ${structureLabels.acts.get(act.id)?.label}`}
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
                                      <button
                                        type="button"
                                        className="outline-chapter-collapse"
                                        onClick={() =>
                                          setCollapsedChapters((current) => {
                                            const next = new Set(current);
                                            if (next.has(chapter.id)) next.delete(chapter.id);
                                            else next.add(chapter.id);
                                            return next;
                                          })
                                        }
                                      >
                                        <ChevronDown
                                          className={
                                            collapsedChapters.has(chapter.id) ? "collapsed" : ""
                                          }
                                          size={14}
                                        />
                                        <strong>
                                          {structureLabels.chapters.get(chapter.id)?.label}
                                        </strong>
                                      </button>
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
                                          void rename("chapter", chapter.id, chapter.title)
                                        }
                                        aria-label={`Rename ${structureLabels.chapters.get(chapter.id)?.label}`}
                                      >
                                        <MoreVertical size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-button danger"
                                        onClick={() =>
                                          void remove(
                                            "chapter",
                                            chapter.id,
                                            structureLabels.chapters.get(chapter.id)?.label ??
                                              "Chapter",
                                          )
                                        }
                                        aria-label={`Delete ${structureLabels.chapters.get(chapter.id)?.label}`}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </header>
                                    {!collapsedChapters.has(chapter.id) ? (
                                      <>
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
                                                    aiConfigured={aiConfigured}
                                                    scene={scene}
                                                    displayLabel={
                                                      structureLabels.scenes.get(scene.id)?.label ??
                                                      "Scene"
                                                    }
                                                    entries={orderedEntries}
                                                    labelPacks={labelLibrary.allPacks}
                                                    onOpenScene={onOpenScene}
                                                    onOpenEntry={onOpenEntry}
                                                    onManageLabels={() => setLabelManagerOpen(true)}
                                                    onCreateQuickLabel={createQuickLabel}
                                                    onUpdated={(updated) =>
                                                      setTree(updateSceneInTree(tree, updated))
                                                    }
                                                    onRename={() =>
                                                      void rename("scene", scene.id, scene.title, {
                                                        expectedVersion: scene.version,
                                                      })
                                                    }
                                                    onDelete={() =>
                                                      void remove(
                                                        "scene",
                                                        scene.id,
                                                        structureLabels.scenes.get(scene.id)
                                                          ?.label ?? "Scene",
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
                                            void create({
                                              kind: "scene",
                                              chapterId: chapter.id,
                                              afterSceneId: chapter.scenes.at(-1)?.id ?? null,
                                            })
                                          }
                                        >
                                          <Plus size={13} /> New Scene
                                        </button>
                                      </>
                                    ) : null}
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
                onClick={() =>
                  void create({ kind: "act", afterActId: tree.acts.at(-1)?.id ?? null })
                }
              >
                <Plus size={14} /> New Act
              </button>
            </div>
          </div>
        </SortableContext>
      </DndContext>
      <LabelPackManager
        open={labelManagerOpen}
        projectId={projectId}
        configuredPacks={tree.project.settings.labelPacks}
        legacyLabels={legacyLabels}
        onClose={() => setLabelManagerOpen(false)}
        onSaved={() => client.invalidateQueries({ queryKey: ["project-tree", projectId] })}
      />
    </section>
  );
}
