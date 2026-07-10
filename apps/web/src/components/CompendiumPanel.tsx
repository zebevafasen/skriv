import type { CompendiumEntry } from "@asterism/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  BookOpenText,
  Box,
  ChevronDown,
  FileText,
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

function entrySummary(entry: CompendiumEntry): string {
  if (entry.content.kind === "text") return entry.content.text || "No description yet";
  if (entry.content.kind === "rich_text") return entry.content.plainText;
  return entry.content.values.map((value) => value.label).join(", ");
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
  const createEntry = useMutation({
    mutationFn: (typeId: (typeof storyTypes)[number]["id"]) => {
      const type = storyTypes.find((candidate) => candidate.id === typeId);
      return api<CompendiumEntry>(`/api/projects/${projectId}/compendium`, {
        method: "POST",
        body: JSON.stringify({
          name: `Untitled ${type?.label ?? "Entry"}`,
          typeId,
          aliases: [],
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
    for (const entry of entries.filter((item) =>
      `${item.name} ${item.aliases.join(" ")} ${entrySummary(item)}`
        .toLocaleLowerCase()
        .includes(query),
    )) {
      const label =
        labels.get(entry.typeId) ??
        (entry.typeId.startsWith("project.") ? "Project metadata" : "Other");
      grouped.set(label, [...(grouped.get(label) ?? []), entry]);
    }
    return [...grouped.entries()];
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
            <div className="new-entry-menu" role="menu" aria-label="Choose entry type">
              {storyTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={type.id}
                    disabled={createEntry.isPending}
                    onClick={() => createEntry.mutate(type.id)}
                  >
                    <Icon size={16} /> {type.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {createEntry.error ? <ErrorNotice error={createEntry.error} /> : null}
      <div className="entry-groups">
        {groups.map(([label, groupedEntries]) => (
          <section className="entry-group" key={label}>
            <header>
              <strong>{label}</strong>
              <span>
                {groupedEntries.length} {groupedEntries.length === 1 ? "entry" : "entries"}
              </span>
              <ChevronDown size={13} />
            </header>
            {groupedEntries.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={entry.id === selectedEntryId ? "entry-row active" : "entry-row"}
                onClick={() => onSelect(entry.id)}
              >
                <span>{entry.name}</span>
                <small>{entrySummary(entry).slice(0, 120)}</small>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

export function CompendiumEntryDrawer({
  projectId,
  entry,
  onClose,
}: {
  projectId: string;
  entry: CompendiumEntry | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<CompendiumEntry | null>(entry);
  useEffect(() => setDraft(entry), [entry]);
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
  return (
    <div className="compendium-drawer-layer" data-testid="compendium-drawer-layer">
      <section className="entry-editor compendium-entry-drawer" aria-label="Compendium entry">
        <div className="drawer-handle-row">
          <span>
            <FileText size={13} /> Entry details
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close entry">
            <X size={16} />
          </button>
        </div>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{draft.singleton ? "Project metadata" : "Compendium entry"}</p>
            <input
              className="title-input"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="button-row">
            {!draft.singleton ? (
              <button
                type="button"
                className="button danger"
                aria-label="Delete entry"
                onClick={() => {
                  if (window.confirm(`Delete “${draft.name}”? This cannot be undone.`)) {
                    remove.mutate(draft.id);
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            ) : null}
            <button type="button" className="button primary" onClick={() => save.mutate(draft)}>
              <Save size={15} /> Save
            </button>
          </div>
        </div>
        <div className="entry-form-grid">
          <label>
            Type
            <select
              disabled={draft.singleton}
              value={draft.typeId}
              onChange={(event) =>
                setDraft({ ...draft, typeId: event.target.value as CompendiumEntry["typeId"] })
              }
            >
              {storyTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
              {draft.singleton ? <option value={draft.typeId}>{draft.typeId}</option> : null}
            </select>
          </label>
          <label>
            Activation
            <select
              value={draft.activationMode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  activationMode: event.target.value as CompendiumEntry["activationMode"],
                })
              }
            >
              <option value="mention">Mention</option>
              <option value="always">Always Active</option>
              <option value="never">Never Active</option>
            </select>
          </label>
          <label className="wide">
            Aliases
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
              placeholder="Julia, Jules, Ms. Ashford"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.caseSensitive}
              onChange={(event) => setDraft({ ...draft, caseSensitive: event.target.checked })}
            />
            Case-sensitive matching
          </label>
        </div>
        {draft.content.kind === "selection" ? (
          <div className="selection-readout">
            {draft.content.values.map((value) => (
              <span key={`${value.definitionId}-${value.label}`}>{value.label}</span>
            ))}
          </div>
        ) : (
          <label className="content-field">
            Content
            <textarea
              value={draft.content.kind === "text" ? draft.content.text : draft.content.plainText}
              onChange={(event) =>
                setDraft({ ...draft, content: { kind: "text", text: event.target.value } })
              }
              placeholder="Describe only what is true in the story world…"
            />
          </label>
        )}
        {save.error || remove.error ? <ErrorNotice error={save.error ?? remove.error} /> : null}
      </section>
    </div>
  );
}
