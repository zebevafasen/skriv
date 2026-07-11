import type { CompendiumEntry } from "@asterism/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  BookOpenText,
  Box,
  ChevronDown,
  Cog,
  ImagePlus,
  Landmark,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./AppShell.js";

const storyTypes = [
  { id: "story.character", label: "Character", icon: UserRound },
  { id: "story.location", label: "Location", icon: MapPin },
  { id: "story.object", label: "Object / Item", icon: Box },
  { id: "story.faction", label: "Faction", icon: UsersRound },
  { id: "story.lore", label: "Lore", icon: Landmark },
] as const;

const suggestedLabels: Record<(typeof storyTypes)[number]["id"], string[]> = {
  "story.character": ["Protagonist", "Antagonist", "POV", "Supporting", "Minor"],
  "story.location": ["City", "Town", "Village", "Region", "Building", "Landmark"],
  "story.object": ["Artifact", "Weapon", "Tool", "Vehicle", "Document"],
  "story.faction": ["Organization", "Government", "Guild", "Family", "Religion"],
  "story.lore": ["Culture", "History", "Magic", "Religion", "Event", "Technology"],
};

function entrySummary(entry: CompendiumEntry): string {
  if (entry.content.kind === "text") return entry.content.text || "No description yet";
  if (entry.content.kind === "rich_text") return entry.content.plainText;
  return entry.content.values.map((value) => value.label).join(", ");
}

function StoryTypeMenu({
  onSelect,
  disabled,
}: {
  onSelect: (typeId: (typeof storyTypes)[number]["id"]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="new-entry-menu" role="menu" aria-label="Choose entry type">
      {storyTypes.map((type) => {
        const Icon = type.icon;
        return (
          <button
            type="button"
            role="menuitem"
            key={type.id}
            disabled={disabled}
            onClick={() => onSelect(type.id)}
          >
            <Icon size={16} /> {type.label}
          </button>
        );
      })}
    </div>
  );
}

export function CompendiumPanel({
  projectId,
  entries,
  selectedEntryId,
  onSelect,
  onShowManuscript,
}: {
  projectId: string;
  entries: CompendiumEntry[];
  selectedEntryId: string | null;
  onSelect: (id: string | null) => void;
  onShowManuscript: () => void;
}) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const createEntry = useMutation({
    mutationFn: (typeId: (typeof storyTypes)[number]["id"]) => {
      const type = storyTypes.find((candidate) => candidate.id === typeId);
      return api<CompendiumEntry>(`/api/projects/${projectId}/compendium`, {
        method: "POST",
        body: JSON.stringify({
          name: `Untitled ${type?.label ?? "Entry"}`,
          typeId,
          aliases: [],
          labels: [],
          imageDataUrl: null,
          trackingEnabled: true,
          matchExclusions: [],
          activationMode: "mention",
          caseSensitive: false,
          content: { kind: "text", text: "" },
        }),
      });
    },
    onSuccess: async (entry) => {
      setCreateMenuOpen(false);
      await client.invalidateQueries({ queryKey: ["compendium", projectId] });
      onSelect(entry.id);
    },
  });
  const groups = useMemo(() => {
    const labels = new Map<string, string>(storyTypes.map((type) => [type.id, type.label]));
    const grouped = new Map<string, CompendiumEntry[]>();
    const query = search.trim().toLocaleLowerCase();
    for (const entry of entries.filter((item) => {
      if (item.singleton) {
        const isEmpty =
          item.content.kind === "selection"
            ? item.content.values.length === 0
            : item.content.kind === "text"
              ? !item.content.text.trim()
              : !item.content.plainText.trim();
        if (isEmpty) return false;
      }
      return `${item.name} ${item.aliases.join(" ")} ${item.labels.join(" ")} ${entrySummary(item)}`
        .toLocaleLowerCase()
        .includes(query);
    })) {
      const label =
        labels.get(entry.typeId) ??
        (entry.typeId.startsWith("project.") ? "Project metadata" : "Other");
      grouped.set(label, [...(grouped.get(label) ?? []), entry]);
    }
    const groupOrder = new Map<string, number>([
      ...storyTypes.map((type, index) => [type.label, index] as const),
      ["Other", storyTypes.length] as const,
      ["Project metadata", storyTypes.length + 1] as const,
    ]);
    return [...grouped.entries()].sort(
      ([left], [right]) =>
        (groupOrder.get(left) ?? storyTypes.length) - (groupOrder.get(right) ?? storyTypes.length),
    );
  }, [entries, search]);

  return (
    <aside className="entry-list compendium-sidebar">
      <div className="sidebar-tabs">
        <button type="button" onClick={onShowManuscript}>
          <BookOpenText size={14} /> Manuscript
        </button>
        <button type="button" className="active">
          <BookMarked size={14} /> Compendium
        </button>
      </div>
      <div className="compendium-sidebar-toolbar">
        <label className="entry-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search all entries…"
          />
          {search ? (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
              <X size={13} />
            </button>
          ) : null}
        </label>
        <div className="new-entry-control">
          <button
            type="button"
            className="button ghost new-entry-button"
            aria-expanded={createMenuOpen}
            onClick={() => setCreateMenuOpen((value) => !value)}
          >
            <Plus size={15} /> New Entry
          </button>
          {createMenuOpen ? (
            <StoryTypeMenu
              disabled={createEntry.isPending}
              onSelect={(typeId) => createEntry.mutate(typeId)}
            />
          ) : null}
        </div>
      </div>
      {createEntry.error ? <ErrorNotice error={createEntry.error} /> : null}
      <div className="entry-groups">
        {groups.map(([label, groupedEntries]) => {
          const collapsed = collapsedGroups.has(label) && !search.trim();
          return (
            <section className="entry-group" key={label}>
              <header>
                <button
                  type="button"
                  className="entry-group-toggle"
                  aria-expanded={!collapsed}
                  onClick={() =>
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(label)) next.delete(label);
                      else next.add(label);
                      return next;
                    })
                  }
                >
                  <strong>{label}</strong>
                  <span>
                    {groupedEntries.length} {groupedEntries.length === 1 ? "entry" : "entries"}
                  </span>
                  <ChevronDown className={collapsed ? "collapsed" : ""} size={13} />
                </button>
              </header>
              {!collapsed
                ? groupedEntries.map((entry) => {
                    const EntryTypeIcon =
                      storyTypes.find((type) => type.id === entry.typeId)?.icon ??
                      (entry.typeId.startsWith("project.") ? Cog : BookMarked);
                    return (
                      <button
                        type="button"
                        key={entry.id}
                        className={entry.id === selectedEntryId ? "entry-row active" : "entry-row"}
                        onClick={() => onSelect(entry.id)}
                      >
                        <span className="entry-row-avatar">
                          {entry.imageDataUrl ? (
                            <img src={entry.imageDataUrl} alt={`${entry.name} portrait`} />
                          ) : (
                            <span className="entry-row-avatar-fallback">
                              <EntryTypeIcon size={19} aria-hidden="true" />
                            </span>
                          )}
                        </span>
                        <span className="entry-row-copy">
                          <span className="entry-row-title">
                            <span>{entry.name}</span>
                            {entry.labels.slice(0, 2).map((label) => (
                              <em key={label}>{label}</em>
                            ))}
                          </span>
                          <small>{entrySummary(entry).slice(0, 120)}</small>
                        </span>
                      </button>
                    );
                  })
                : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

const contextModes: Array<{
  value: CompendiumEntry["activationMode"];
  title: string;
  description: string;
}> = [
  {
    value: "always",
    title: "Always include",
    description: "Always place this entry in the AI context, whether it is mentioned or not.",
  },
  {
    value: "mention",
    title: "Include when mentioned",
    description: "Add this entry when its name or an alias is found in the relevant prose.",
  },
  {
    value: "never",
    title: "Never include",
    description: "Keep this entry private from AI context even when it is mentioned.",
  },
  {
    value: "smart",
    title: "Smart inclusion",
    description: "Let Smart Context decide whether this entry is relevant to the generation.",
  },
];

export function CompendiumEntryDrawer({
  projectId,
  entry,
  mentionCount = 0,
  onClose,
}: {
  projectId: string;
  entry: CompendiumEntry | null;
  mentionCount?: number;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<CompendiumEntry | null>(entry);
  const [tab, setTab] = useState<"details" | "tracking">("details");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(entry);
    setTab("details");
    setTypeMenuOpen(false);
    setLabelInput("");
    setImageError(null);
  }, [entry]);
  const invalidate = () => client.invalidateQueries({ queryKey: ["compendium", projectId] });
  const save = useMutation({
    mutationFn: (value: CompendiumEntry) =>
      api<CompendiumEntry>(`/api/compendium/${value.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: value.revision,
          name: value.name,
          typeId: value.typeId,
          aliases: value.aliases,
          labels: value.labels,
          imageDataUrl: value.imageDataUrl,
          trackingEnabled: value.trackingEnabled,
          matchExclusions: value.matchExclusions,
          activationMode: value.activationMode,
          caseSensitive: value.caseSensitive,
          content: value.content,
        }),
      }),
    onSuccess: async (updated) => {
      setDraft(updated);
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/compendium/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      onClose();
      await invalidate();
    },
  });

  if (!draft) return null;
  const currentType = storyTypes.find((type) => type.id === draft.typeId);
  const CurrentTypeIcon = currentType?.icon ?? BookMarked;
  const presets = currentType ? suggestedLabels[currentType.id] : [];
  const filteredPresets = presets.filter(
    (label) =>
      !draft.labels.some(
        (existing) => existing.toLocaleLowerCase() === label.toLocaleLowerCase(),
      ) && label.toLocaleLowerCase().includes(labelInput.trim().toLocaleLowerCase()),
  );
  const addLabel = (rawLabel: string) => {
    const label = rawLabel.trim();
    if (
      !label ||
      draft.labels.some((existing) => existing.toLocaleLowerCase() === label.toLocaleLowerCase())
    )
      return;
    setDraft({ ...draft, labels: [...draft.labels, label] });
    setLabelInput("");
    setLabelMenuOpen(false);
  };
  const description =
    draft.content.kind === "text"
      ? draft.content.text
      : draft.content.kind === "rich_text"
        ? draft.content.plainText
        : "";
  const wordCount = description.trim() ? description.trim().split(/\s+/u).length : 0;

  return (
    <div className="compendium-drawer-layer" data-testid="compendium-drawer-layer">
      <section className="entry-editor compendium-entry-drawer" aria-label="Compendium entry">
        <div className="drawer-toolbar">
          <span>Compendium entry</span>
          <div className="button-row">
            {draft.singleton ? (
              <button
                type="button"
                className="button ghost danger"
                onClick={() => {
                  if (!window.confirm(`Clear “${draft.name}”?`)) return;
                  const cleared = {
                    ...draft,
                    content:
                      draft.content.kind === "selection"
                        ? { kind: "selection" as const, values: [] }
                        : draft.content.kind === "text"
                          ? { kind: "text" as const, text: "" }
                          : {
                              kind: "rich_text" as const,
                              plainText: "",
                              document: { type: "doc" as const, content: [] },
                            },
                  };
                  setDraft(cleared);
                  save.mutate(cleared);
                }}
              >
                Clear
              </button>
            ) : (
              <button
                type="button"
                className="icon-button danger"
                aria-label="Delete entry"
                onClick={() => {
                  if (window.confirm(`Delete “${draft.name}”? This cannot be undone.`))
                    remove.mutate(draft.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              type="button"
              className="button primary"
              disabled={save.isPending || !draft.name.trim()}
              onClick={() => save.mutate(draft)}
            >
              <Save size={15} /> {save.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close entry"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="drawer-entry-header">
          <div className="drawer-entry-identity">
            <div className="entry-type-control">
              <button
                type="button"
                className="entry-type-button"
                disabled={draft.singleton}
                aria-expanded={typeMenuOpen}
                onClick={() => setTypeMenuOpen((value) => !value)}
              >
                <CurrentTypeIcon size={15} /> {currentType?.label ?? "Project metadata"}
                {!draft.singleton ? <ChevronDown size={14} /> : null}
              </button>
              {typeMenuOpen ? (
                <StoryTypeMenu
                  onSelect={(typeId) => {
                    setDraft({ ...draft, typeId });
                    setTypeMenuOpen(false);
                  }}
                />
              ) : null}
            </div>
            <input
              className="drawer-title-input"
              aria-label="Entry name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <div className="entry-label-editor">
              <div className="entry-label-chips">
                {draft.labels.map((label) => (
                  <button
                    type="button"
                    key={label}
                    title={`Remove ${label}`}
                    onClick={() =>
                      setDraft({ ...draft, labels: draft.labels.filter((item) => item !== label) })
                    }
                  >
                    {label} <X size={11} />
                  </button>
                ))}
              </div>
              <input
                value={labelInput}
                aria-label="Add tags or labels"
                placeholder="+ Add tags/labels"
                onFocus={() => setLabelMenuOpen(true)}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.endsWith(",")) addLabel(value.slice(0, -1));
                  else {
                    setLabelInput(value);
                    setLabelMenuOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addLabel(labelInput);
                  }
                }}
              />
              {labelMenuOpen && (filteredPresets.length > 0 || labelInput.trim()) ? (
                <div className="label-suggestion-menu">
                  {labelInput.trim() ? (
                    <button type="button" onClick={() => addLabel(labelInput)}>
                      <Plus size={13} /> Create “{labelInput.trim()}”
                    </button>
                  ) : null}
                  {filteredPresets.map((label) => (
                    <button type="button" key={label} onClick={() => addLabel(label)}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="entry-image-control">
            {draft.imageDataUrl ? (
              <img src={draft.imageDataUrl} alt="Entry portrait" />
            ) : (
              <UserRound size={52} />
            )}
            {!draft.singleton ? (
              <>
                <label htmlFor={`entry-image-${draft.id}`} title="Upload image">
                  <ImagePlus size={16} />
                </label>
                <input
                  id={`entry-image-${draft.id}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2_000_000) {
                      setImageError("Please choose an image smaller than 2 MB.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        setDraft({ ...draft, imageDataUrl: reader.result });
                        setImageError(null);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </>
            ) : null}
            {draft.imageDataUrl ? (
              <button
                type="button"
                className="remove-entry-image"
                onClick={() => setDraft({ ...draft, imageDataUrl: null })}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        {imageError ? <p className="field-error">{imageError}</p> : null}

        <div className="mention-divider">
          <span>
            {mentionCount} {mentionCount === 1 ? "mention" : "mentions"}
          </span>
        </div>
        <div className="drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "details"}
            className={tab === "details" ? "active" : ""}
            onClick={() => setTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tracking"}
            className={tab === "tracking" ? "active" : ""}
            onClick={() => setTab("tracking")}
          >
            Tracking
          </button>
        </div>

        {tab === "details" ? (
          <div className="drawer-tab-content">
            <label className="drawer-field">
              <strong>Aliases / alternate names</strong>
              <small>
                Separate names with commas. These names are used for tracking, not as labels.
              </small>
              <input
                value={draft.aliases.join(", ")}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    aliases: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Add aliases, …"
              />
            </label>
            {draft.content.kind === "selection" ? (
              <div className="selection-readout">
                {draft.content.values.map((value) => (
                  <span key={`${value.definitionId}-${value.label}`}>{value.label}</span>
                ))}
              </div>
            ) : (
              <label className="drawer-field description-field">
                <strong>Description</strong>
                <small>Write the information the AI should know about this entry.</small>
                <textarea
                  value={description}
                  onChange={(event) =>
                    setDraft({ ...draft, content: { kind: "text", text: event.target.value } })
                  }
                  placeholder="Write a description…"
                />
                <span className="word-count">
                  {wordCount} {wordCount === 1 ? "word" : "words"}
                </span>
              </label>
            )}
          </div>
        ) : (
          <div className="drawer-tab-content tracking-panel">
            <section>
              <h3>Tracking / matching</h3>
              <label className="tracking-checkbox">
                <input
                  type="checkbox"
                  checked={draft.trackingEnabled}
                  onChange={(event) =>
                    setDraft({ ...draft, trackingEnabled: event.target.checked })
                  }
                />
                <span>
                  <strong>Track this entry by name and aliases</strong>
                  <small>
                    Underline matches in your manuscript and use them for mention-based context.
                  </small>
                </span>
              </label>
              <label className="tracking-checkbox">
                <input
                  type="checkbox"
                  checked={draft.caseSensitive}
                  onChange={(event) => setDraft({ ...draft, caseSensitive: event.target.checked })}
                />
                <span>
                  <strong>Use case-sensitive matching</strong>
                  <small>Off by default. When enabled, capitalization must match exactly.</small>
                </span>
              </label>
              <label className="drawer-field exclusion-field">
                <strong>Exclusions</strong>
                <small>Comma-separated phrases that should not trigger this entry.</small>
                <input
                  value={draft.matchExclusions.join(", ")}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      matchExclusions: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Add phrases to exclude, …"
                />
              </label>
            </section>
            <section className="context-mode-section">
              <h3>AI context</h3>
              <p>Choose when this description may be sent to the writing model.</p>
              <div className="context-mode-options">
                {contextModes.map((mode) => (
                  <label
                    key={mode.value}
                    className={draft.activationMode === mode.value ? "active" : ""}
                  >
                    <input
                      type="radio"
                      name={`activation-${draft.id}`}
                      value={mode.value}
                      checked={draft.activationMode === mode.value}
                      onChange={() => setDraft({ ...draft, activationMode: mode.value })}
                    />
                    <span>
                      <strong>
                        {mode.title}
                        {mode.value === "mention" ? (
                          <em className="context-default-badge">Default</em>
                        ) : null}
                      </strong>
                      <small>{mode.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
        {save.error || remove.error ? <ErrorNotice error={save.error ?? remove.error} /> : null}
      </section>
    </div>
  );
}
