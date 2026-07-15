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
} from "@skriv/contracts";
import { findMentions, manuscriptLabels } from "@skriv/core";
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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { skriv } from "../api.js";
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

type OutlineModel = { id: string; name: string };
type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

const standardCompendiumLabels: Record<string, string> = {
  "story.character": "Characters",
  "story.location": "Locations",
  "story.object": "Objects",
  "story.faction": "Factions",
  "story.lore": "Lore",
  "story.other": "Other",
  "project.premise": "Premise",
  "project.genres": "Genres",
  "project.themes": "Themes",
  "project.tags": "Tags",
  "project.instructions": "Instructions",
};

function compendiumEntryHasValue(entry: CompendiumEntry): boolean {
  if (!entry.typeId.startsWith("project.")) return true;
  if (entry.content.kind === "rich_text") return Boolean(entry.content.plainText.trim());
  if (entry.content.kind === "text") return Boolean(entry.content.text.trim());
  return entry.content.values.length > 0;
}

function useAnchoredPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  width: number,
  desiredHeight: number,
): MenuPosition | null {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const edge = 12;
      const gap = 7;
      const resolvedWidth = Math.min(width, window.innerWidth - edge * 2);
      const spaceAbove = Math.max(0, rect.top - edge - gap);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - edge - gap);
      const openBelow = spaceBelow >= Math.min(desiredHeight, spaceAbove);
      const available = openBelow ? spaceBelow : spaceAbove;
      const maxHeight = Math.min(desiredHeight, available);
      const left = Math.min(
        Math.max(edge, rect.right - resolvedWidth),
        Math.max(edge, window.innerWidth - resolvedWidth - edge),
      );
      const top = openBelow ? rect.bottom + gap : Math.max(edge, rect.top - gap - maxHeight);
      setPosition({ top, left, width: resolvedWidth, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, desiredHeight, open, width]);
  return position;
}

function EditableStructureTitle({
  displayLabel,
  title,
  editing,
  onStart,
  onCancel,
  onCommit,
}: {
  displayLabel: string;
  title: string;
  editing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onCommit: (title: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelling = useRef(false);
  useEffect(() => {
    if (!editing) return;
    cancelling.current = false;
    setDraft(title);
    const frame = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [editing, title]);

  if (!editing) {
    return (
      <button
        type="button"
        className="outline-inline-title"
        aria-label={`Rename ${displayLabel}`}
        onClick={onStart}
      >
        {displayLabel}
      </button>
    );
  }
  return (
    <input
      ref={inputRef}
      className="outline-inline-title-input"
      aria-label={`Rename ${displayLabel}`}
      value={draft}
      maxLength={300}
      placeholder={displayLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelling.current) return;
        onCancel();
        if (draft.trim() !== title) onCommit(draft.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelling.current = true;
          setDraft(title);
          onCancel();
        }
      }}
    />
  );
}

function OutlineItemMenu({
  displayLabel,
  onRename,
  onDelete,
  summary,
}: {
  displayLabel: string;
  onRename: () => void;
  onDelete: () => void;
  summary?: {
    disabled: boolean;
    generating: boolean;
    baseModel: string;
    models: OutlineModel[];
    onSummarize: (modelOverride: string | null) => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(open, buttonRef, summaryOpen ? 280 : 210, 390);
  const defaultModelName =
    summary?.models.find((model) => model.id === summary.baseModel)?.name ?? summary?.baseModel;
  const filteredModels = (summary?.models ?? []).filter(
    (model) =>
      model.id !== summary?.baseModel &&
      `${model.name} ${model.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
        setSummaryOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (summaryOpen) setSummaryOpen(false);
      else setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [open, summaryOpen]);

  const close = () => {
    setOpen(false);
    setSummaryOpen(false);
    setSearch("");
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button outline-more-button"
        aria-label={`More options for ${displayLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setSummaryOpen(false);
        }}
      >
        <MoreVertical size={14} />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              className="outline-item-menu"
              role="menu"
              aria-label={`Options for ${displayLabel}`}
              style={position}
            >
              {summaryOpen && summary ? (
                <>
                  <header>
                    <button
                      type="button"
                      aria-label="Back to Scene options"
                      onClick={() => setSummaryOpen(false)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <strong>Summarize Scene</strong>
                  </header>
                  <label className="outline-model-search">
                    <Search size={13} />
                    <input
                      value={search}
                      placeholder="Find a model…"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <div className="outline-summary-models">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        summary.onSummarize(null);
                      }}
                    >
                      <span>
                        <strong>Use default</strong>
                        <small>{defaultModelName}</small>
                      </span>
                    </button>
                    {filteredModels.map((model) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={model.id}
                        onClick={() => {
                          close();
                          summary.onSummarize(model.id);
                        }}
                      >
                        <span>
                          <strong>{model.name}</strong>
                          <small>{model.id}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      onRename();
                    }}
                  >
                    <Pencil size={14} /> Rename
                  </button>
                  {summary ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={summary.disabled}
                      onClick={() => setSummaryOpen(true)}
                    >
                      <Sparkles size={14} />
                      {summary.generating ? "Summarizing…" : "Summarize Scene"}
                      <ChevronRight size={14} />
                    </button>
                  ) : null}
                  <div className="outline-item-menu-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      close();
                      onDelete();
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CompendiumEntryPicker({
  displayLabel,
  entries,
  selectedIds,
  typeLabel,
  onChange,
}: {
  displayLabel: string;
  entries: CompendiumEntry[];
  selectedIds: string[];
  typeLabel: (typeId: string) => string;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(open, buttonRef, 300, 410);
  const selected = new Set(selectedIds);
  const available = entries.filter(
    (entry) =>
      compendiumEntryHasValue(entry) &&
      `${entry.name} ${typeLabel(entry.typeId)}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const groups = [...new Set(available.map((entry) => typeLabel(entry.typeId)))];

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="outline-compendium-add"
        aria-label={`Add Compendium entry to ${displayLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Plus size={12} />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              className="outline-compendium-menu"
              role="menu"
              aria-label={`Compendium entries for ${displayLabel}`}
              style={position}
            >
              <header>
                <strong>Add Compendium entries</strong>
                <small>Manually keep entries on this card</small>
              </header>
              <label className="outline-model-search">
                <Search size={13} />
                <input
                  value={search}
                  placeholder="Search Compendium…"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="outline-compendium-options">
                {groups.map((group) => (
                  <section key={group}>
                    <strong>{group}</strong>
                    {available
                      .filter((entry) => typeLabel(entry.typeId) === group)
                      .map((entry) => (
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={selected.has(entry.id)}
                          key={entry.id}
                          onClick={() =>
                            onChange(
                              selected.has(entry.id)
                                ? selectedIds.filter((id) => id !== entry.id)
                                : [...selectedIds, entry.id],
                            )
                          }
                        >
                          <span>{entry.name}</span>
                          {selected.has(entry.id) ? <Check size={14} /> : null}
                        </button>
                      ))}
                  </section>
                ))}
                {!available.length ? <p>No matching Compendium entries.</p> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

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
  baseModel,
  models,
  scene,
  displayLabel,
  entries,
  typeLabel,
  labelPacks,
  onOpenScene,
  onOpenEntry,
  onManageLabels,
  onCreateQuickLabel,
  onUpdated,
  editingTitle,
  onStartRename,
  onStopRename,
  onRenameTitle,
  onDelete,
  dragHandle,
}: {
  aiConfigured: boolean;
  baseModel: string;
  models: OutlineModel[];
  scene: Scene;
  displayLabel: string;
  entries: CompendiumEntry[];
  typeLabel: (typeId: string) => string;
  labelPacks: SceneLabelPack[];
  onOpenScene: (sceneId: string) => void;
  onOpenEntry: (entryIds: string[]) => void;
  onManageLabels: () => void;
  onCreateQuickLabel: (
    name: string,
    color: SceneLabelColor,
  ) => Promise<{ pack: SceneLabelPack; definition: SceneLabelDefinition }>;
  onUpdated: (scene: Scene) => void;
  editingTitle: boolean;
  onStartRename: () => void;
  onStopRename: () => void;
  onRenameTitle: (title: string, expectedVersion: number) => Promise<void>;
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
      const updated = await skriv().manuscript.updateScene(scene.id, {
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

  const automaticallyMentionedIds = useMemo(() => {
    const ids = new Set(findMentions(scene.plainText, entries).flatMap((match) => match.entryIds));
    return entries.filter((entry) => ids.has(entry.id)).map((entry) => entry.id);
  }, [entries, scene.plainText]);
  const manualEntryIds = metadata.manualCompendiumEntryIds ?? [];
  const visibleEntryIds = useMemo(
    () => [
      ...automaticallyMentionedIds,
      ...manualEntryIds.filter(
        (id) => !automaticallyMentionedIds.includes(id) && entries.some((entry) => entry.id === id),
      ),
    ],
    [automaticallyMentionedIds, entries, manualEntryIds],
  );

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

  const generateSummary = async (modelOverride: string | null) => {
    setGenerating(true);
    setError(null);
    const saved = saveState === "saving" ? await persist() : null;
    const expectedVersion = saved?.version ?? version.current;
    try {
      const updated = await skriv().manuscript.generateSummary(scene.id, {
        expectedVersion,
        modelOverride,
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
  };

  const renameScene = async (title: string) => {
    const saved = saveState === "saving" ? await persist() : null;
    await onRenameTitle(title, saved?.version ?? version.current);
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
        <EditableStructureTitle
          displayLabel={displayLabel}
          title={scene.title}
          editing={editingTitle}
          onStart={onStartRename}
          onCancel={onStopRename}
          onCommit={(title) => void renameScene(title)}
        />
        <span>{wordCount(scene.plainText)} words</span>
        <button
          type="button"
          className="icon-button outline-open-scene"
          aria-label={`Open ${displayLabel}`}
          title="Open Scene"
          onClick={() => onOpenScene(scene.id)}
        >
          <Pencil size={13} />
        </button>
        <OutlineItemMenu
          displayLabel={displayLabel}
          onRename={onStartRename}
          onDelete={onDelete}
          summary={{
            disabled:
              !aiConfigured || generating || !scene.plainText.trim() || saveState === "conflict",
            generating,
            baseModel,
            models,
            onSummarize: (modelOverride) => void generateSummary(modelOverride),
          }}
        />
      </header>
      <textarea
        aria-label={`${displayLabel} summary`}
        value={metadata.summary}
        onChange={(event) => changeMetadata({ ...metadata, summary: event.target.value })}
        placeholder="Add summary…"
      />
      <div className="outline-compendium-chips">
        {visibleEntryIds.map((id) => {
          const entry = entries.find((candidate) => candidate.id === id);
          return entry ? (
            <button type="button" key={id} onClick={() => onOpenEntry([id])}>
              {entry.name}
            </button>
          ) : null;
        })}
        <CompendiumEntryPicker
          displayLabel={displayLabel}
          entries={entries}
          selectedIds={manualEntryIds}
          typeLabel={typeLabel}
          onChange={(manualCompendiumEntryIds) =>
            changeMetadata({ ...metadata, manualCompendiumEntryIds })
          }
        />
      </div>
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
          ref={labelButtonRef}
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
      </footer>
      {error ? <ErrorNotice error={error} /> : null}
    </article>
  );
}

export function OutlineGrid({
  aiConfigured,
  baseModel,
  models,
  projectId,
  tree,
  entries,
  onOpenScene,
  onOpenEntry,
}: {
  aiConfigured: boolean;
  baseModel: string;
  models: OutlineModel[];
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
    queryFn: () => skriv().compendium.categories(projectId),
  });
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(() => new Set());
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(() => new Set());
  const [editingItem, setEditingItem] = useState<{
    kind: "act" | "chapter" | "scene";
    id: string;
  } | null>(null);
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
  const typeLabel = useCallback(
    (typeId: string) =>
      categories.data?.find((category) => `custom.${category.id}` === typeId)?.name ??
      standardCompendiumLabels[typeId] ??
      "Other",
    [categories.data],
  );
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
    await skriv().projects.update(projectId, { settings: { labelPacks: userPacks } });
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
      await skriv().manuscript.createItem(projectId, input);
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
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
    const next = title.trim();
    try {
      await skriv().manuscript.updateItem(kind, id, { ...body, title: next });
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
      await skriv().manuscript.removeItem(kind, id);
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
              (orderedIds) => skriv().manuscript.reorderActs(projectId, orderedIds),
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
                (orderedIds) => skriv().manuscript.reorderChapters(act.id, orderedIds),
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
                  (orderedIds) => skriv().manuscript.reorderScenes(chapter.id, orderedIds),
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
                          className="outline-collapse-toggle"
                          aria-label={`${collapsedActs.has(act.id) ? "Expand" : "Collapse"} ${structureLabels.acts.get(act.id)?.label}`}
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
                        </button>
                        <EditableStructureTitle
                          displayLabel={structureLabels.acts.get(act.id)?.label ?? "Act"}
                          title={act.title}
                          editing={editingItem?.kind === "act" && editingItem.id === act.id}
                          onStart={() => setEditingItem({ kind: "act", id: act.id })}
                          onCancel={() => setEditingItem(null)}
                          onCommit={(title) => void rename("act", act.id, title)}
                        />
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
                        <OutlineItemMenu
                          displayLabel={structureLabels.acts.get(act.id)?.label ?? "Act"}
                          onRename={() => setEditingItem({ kind: "act", id: act.id })}
                          onDelete={() =>
                            void remove(
                              "act",
                              act.id,
                              structureLabels.acts.get(act.id)?.label ?? "Act",
                            )
                          }
                        />
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
                                        className="outline-collapse-toggle"
                                        aria-label={`${collapsedChapters.has(chapter.id) ? "Expand" : "Collapse"} ${structureLabels.chapters.get(chapter.id)?.label}`}
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
                                      </button>
                                      <EditableStructureTitle
                                        displayLabel={
                                          structureLabels.chapters.get(chapter.id)?.label ??
                                          "Chapter"
                                        }
                                        title={chapter.title}
                                        editing={
                                          editingItem?.kind === "chapter" &&
                                          editingItem.id === chapter.id
                                        }
                                        onStart={() =>
                                          setEditingItem({ kind: "chapter", id: chapter.id })
                                        }
                                        onCancel={() => setEditingItem(null)}
                                        onCommit={(title) =>
                                          void rename("chapter", chapter.id, title)
                                        }
                                      />
                                      <span>
                                        {chapter.scenes.reduce(
                                          (sum, scene) => sum + wordCount(scene.plainText),
                                          0,
                                        )}{" "}
                                        words
                                      </span>
                                      <OutlineItemMenu
                                        displayLabel={
                                          structureLabels.chapters.get(chapter.id)?.label ??
                                          "Chapter"
                                        }
                                        onRename={() =>
                                          setEditingItem({ kind: "chapter", id: chapter.id })
                                        }
                                        onDelete={() =>
                                          void remove(
                                            "chapter",
                                            chapter.id,
                                            structureLabels.chapters.get(chapter.id)?.label ??
                                              "Chapter",
                                          )
                                        }
                                      />
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
                                                    baseModel={baseModel}
                                                    models={models}
                                                    scene={scene}
                                                    displayLabel={
                                                      structureLabels.scenes.get(scene.id)?.label ??
                                                      "Scene"
                                                    }
                                                    entries={orderedEntries}
                                                    typeLabel={typeLabel}
                                                    labelPacks={labelLibrary.allPacks}
                                                    onOpenScene={onOpenScene}
                                                    onOpenEntry={onOpenEntry}
                                                    onManageLabels={() => setLabelManagerOpen(true)}
                                                    onCreateQuickLabel={createQuickLabel}
                                                    onUpdated={(updated) =>
                                                      setTree(updateSceneInTree(tree, updated))
                                                    }
                                                    editingTitle={
                                                      editingItem?.kind === "scene" &&
                                                      editingItem.id === scene.id
                                                    }
                                                    onStartRename={() =>
                                                      setEditingItem({
                                                        kind: "scene",
                                                        id: scene.id,
                                                      })
                                                    }
                                                    onStopRename={() => setEditingItem(null)}
                                                    onRenameTitle={async (
                                                      title,
                                                      expectedVersion,
                                                    ) => {
                                                      setEditingItem(null);
                                                      await rename("scene", scene.id, title, {
                                                        expectedVersion,
                                                      });
                                                    }}
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
