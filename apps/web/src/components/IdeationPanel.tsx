import type { AiSettings, ContentPackage } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dice5, Lock, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./AppShell.js";
import { ModelSelect } from "./ModelSelect.js";

type Value = { definitionId: string | null; label: string; locked: boolean };
type Metadata = {
  premise: { kind: "text"; text: string };
  genres: { kind: "selection"; values: Value[] };
  themes: { kind: "selection"; values: Value[] };
  tags: { kind: "selection"; values: Value[] };
  instructions: { kind: "text"; text: string };
};
type Collection = {
  id: string;
  name: string;
  kind: "genre" | "theme" | "tag";
  values: Array<{ definitionId: string | null; label: string }>;
};
type CustomDefinition = { id: string; kind: "genre" | "theme" | "tag"; label: string };
type Definitions = {
  package: ContentPackage;
  enabled: boolean;
  collections: Collection[];
  customDefinitions: CustomDefinition[];
};

export function IdeationPanel({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const definitions = useQuery({
    queryKey: ["ideation-definitions"],
    queryFn: () => api<Definitions>("/api/ideation/definitions"),
  });
  const metadata = useQuery({
    queryKey: ["ideation", projectId],
    queryFn: () => api<Metadata>(`/api/projects/${projectId}/ideation`),
  });
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api<AiSettings>("/api/settings/ai"),
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/api/models"),
  });
  const [genres, setGenres] = useState<Value[]>([]);
  const [themes, setThemes] = useState<Value[]>([]);
  const [tags, setTags] = useState<Value[]>([]);
  const [premise, setPremise] = useState("");
  const [instructions, setInstructions] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [collectionName, setCollectionName] = useState("");
  useEffect(() => {
    if (metadata.data) {
      setGenres(metadata.data.genres?.values ?? []);
      setThemes(metadata.data.themes?.values ?? []);
      setTags(metadata.data.tags?.values ?? []);
      setPremise(metadata.data.premise?.text ?? "");
      setInstructions(metadata.data.instructions?.text ?? "");
    }
  }, [metadata.data]);
  useEffect(() => {
    if (!model && settings.data) {
      setModel(localStorage.getItem("asterism-latest-model") ?? settings.data.baseModel);
    }
  }, [model, settings.data]);
  const save = useMutation({
    mutationFn: (payload: object) =>
      api(`/api/projects/${projectId}/ideation`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["ideation", projectId] }),
  });
  const generate = useMutation({
    mutationFn: () =>
      api<{ alternatives: string[] }>(`/api/projects/${projectId}/ideation/generate`, {
        method: "POST",
        body: JSON.stringify({
          instructions,
          count: 3,
          modelOverride: model && model !== settings.data?.baseModel ? model : null,
        }),
      }),
    onSuccess: (result) => setAlternatives(result.alternatives),
  });
  const togglePackage = useMutation({
    mutationFn: (enabled: boolean) =>
      api("/api/ideation/base-package", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["ideation-definitions"] }),
  });
  const createCollection = useMutation({
    mutationFn: () =>
      api("/api/ideation/collections", {
        method: "POST",
        body: JSON.stringify({
          name: collectionName,
          kind: "tag",
          values: tags.map(({ definitionId, label }) => ({ definitionId, label })),
        }),
      }),
    onSuccess: async () => {
      setCollectionName("");
      await client.invalidateQueries({ queryKey: ["ideation-definitions"] });
    },
  });
  const createDefinition = async (kind: CustomDefinition["kind"], label: string) => {
    const created = await api<CustomDefinition>("/api/ideation/definitions", {
      method: "POST",
      body: JSON.stringify({ kind, label }),
    });
    await client.invalidateQueries({ queryKey: ["ideation-definitions"] });
    return { definitionId: created.id, label: created.label, locked: false } satisfies Value;
  };
  const available = definitions.data?.enabled ? definitions.data.package : null;
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choose = (items: Array<{ id: string; label: string }>, count: number, current: Value[]) => {
    const locked = current.filter((value) => value.locked);
    const random = [...items]
      .filter((item) => !locked.some((value) => value.label === item.label))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(0, count - locked.length))
      .map((item) => ({ definitionId: item.id, label: item.label, locked: false }));
    return [...locked, ...random];
  };

  const randomize = () => {
    if (!available) return;
    setGenres(choose(available.genres, rand(1, 2), genres));
    setThemes(choose(available.themes, rand(1, 3), themes));
    setTags(choose(available.tags, rand(3, 15), tags));
  };
  const persistIngredients = () => save.mutate({ genres, themes, tags, premise, instructions });

  return (
    <div className="workspace-panel ideation-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Story ideation</p>
          <h2>Find the constellation</h2>
          <p>Combine constraints into a premise with its own gravity.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button ghost" onClick={randomize}>
            <Dice5 size={16} /> Randomize
          </button>
          <button type="button" className="button primary" onClick={persistIngredients}>
            Save ingredients
          </button>
        </div>
      </div>
      {definitions.error || metadata.error ? (
        <ErrorNotice error={definitions.error ?? metadata.error} />
      ) : null}
      <div className="ideation-columns">
        <div className="ingredient-stack">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={definitions.data?.enabled ?? true}
              onChange={(event) => togglePackage.mutate(event.target.checked)}
            />
            Include Asterism Base Package
          </label>
          {available ? (
            <>
              <UnifiedTagInput
                title="Genres"
                kind="genre"
                suggestions={[
                  ...available.genres,
                  ...(definitions.data?.customDefinitions.filter((item) => item.kind === "genre") ??
                    []),
                ]}
                values={genres}
                onChange={setGenres}
                onCreate={createDefinition}
                onRandomize={() => setGenres(choose(available.genres, rand(1, 2), genres))}
              />
              <UnifiedTagInput
                title="Themes"
                kind="theme"
                suggestions={[
                  ...available.themes,
                  ...(definitions.data?.customDefinitions.filter((item) => item.kind === "theme") ??
                    []),
                ]}
                values={themes}
                onChange={setThemes}
                onCreate={createDefinition}
                onRandomize={() => setThemes(choose(available.themes, rand(1, 3), themes))}
              />
              <UnifiedTagInput
                title="Tags"
                kind="tag"
                suggestions={[
                  ...available.tags,
                  ...(definitions.data?.customDefinitions.filter((item) => item.kind === "tag") ??
                    []),
                ]}
                values={tags}
                onChange={setTags}
                onCreate={createDefinition}
                onRandomize={() => setTags(choose(available.tags, rand(3, 15), tags))}
              />
            </>
          ) : (
            <div className="loading">Loading ingredients…</div>
          )}
          <section className="ingredient-group">
            <h3>Reusable tag collections</h3>
            <div className="chip-cloud">
              {definitions.data?.collections.map((collection) => (
                <button
                  type="button"
                  key={collection.id}
                  className="chip"
                  onClick={() =>
                    setTags((current) => [
                      ...current,
                      ...collection.values
                        .filter((value) => !current.some((item) => item.label === value.label))
                        .map((value) => ({ ...value, locked: false })),
                    ])
                  }
                >
                  {collection.name}
                </button>
              ))}
            </div>
            <div className="collection-form">
              <input
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                placeholder="Favorite tropes"
              />
              <button
                type="button"
                className="button ghost"
                disabled={!collectionName || tags.length === 0}
                onClick={() => createCollection.mutate()}
              >
                Save current tags
              </button>
            </div>
          </section>
        </div>
        <div className="premise-workbench">
          <div className="form-field">
            <span>Premise model</span>
            <ModelSelect
              value={model}
              onChange={(value) => {
                setModel(value);
                localStorage.setItem("asterism-latest-model", value);
              }}
              models={models.data ?? []}
            />
          </div>
          <label>
            Project instructions
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Adult gothic tone; avoid chosen-one narratives."
            />
          </label>
          <button
            type="button"
            className="button primary full"
            disabled={generate.isPending}
            onClick={() => {
              persistIngredients();
              generate.mutate();
            }}
          >
            <Sparkles size={16} />{" "}
            {generate.isPending ? "Generating…" : "Generate premise alternatives"}
          </button>
          {generate.error ? <ErrorNotice error={generate.error} /> : null}
          <div className="alternative-list">
            {alternatives.map((alternative) => (
              <button type="button" key={alternative} onClick={() => setPremise(alternative)}>
                {alternative}
              </button>
            ))}
          </div>
          <label className="content-field">
            Active premise
            <textarea
              value={premise}
              onChange={(event) => setPremise(event.target.value)}
              placeholder="Your project premise will live here…"
            />
          </label>
          <button type="button" className="button ghost" onClick={() => save.mutate({ premise })}>
            Save premise
          </button>
        </div>
      </div>
    </div>
  );
}

function UnifiedTagInput({
  title,
  kind,
  suggestions,
  values,
  onChange,
  onCreate,
  onRandomize,
}: {
  title: string;
  kind: CustomDefinition["kind"];
  suggestions: Array<{ id: string; label: string }>;
  values: Value[];
  onChange: (values: Value[]) => void;
  onCreate: (kind: CustomDefinition["kind"], label: string) => Promise<Value>;
  onRandomize?: () => void;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const matching = suggestions
    .filter(
      (item) =>
        !values.some((value) => value.label.toLocaleLowerCase() === item.label.toLocaleLowerCase()),
    )
    .filter((item) => item.label.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));
  const add = async () => {
    const label = input.trim().replace(/,$/, "").trim();
    if (!label) return;
    const existing = suggestions.find(
      (item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
    if (values.some((value) => value.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      setInput("");
      return;
    }
    setCreating(true);
    try {
      const value = existing
        ? { definitionId: existing.id, label: existing.label, locked: false }
        : await onCreate(kind, label);
      onChange([...values, value]);
      setInput("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };
  return (
    <section className="ingredient-group unified-tags">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
        }}
      >
        <span className="field-label" style={{ margin: 0 }}>
          {title}
        </span>
        {onRandomize && (
          <button
            type="button"
            className="button ghost"
            style={{ minHeight: "24px", padding: "2px 8px", fontSize: "11px", gap: "4px" }}
            onClick={onRandomize}
            title={`Randomize ${title.toLocaleLowerCase()}`}
          >
            <Dice5 size={12} /> Randomize
          </button>
        )}
      </div>
      <div className="tag-input-shell">
        <div className="selected-tags">
          {values.map((value) => (
            <span className="selected-tag" key={`${value.definitionId}-${value.label}`}>
              <button
                type="button"
                className={value.locked ? "tag-lock active" : "tag-lock"}
                title={value.locked ? "Unlock for randomization" : "Lock during randomization"}
                onClick={() =>
                  onChange(
                    values.map((item) =>
                      item.label === value.label ? { ...item, locked: !item.locked } : item,
                    ),
                  )
                }
              >
                <Lock size={10} />
              </button>
              {value.label}
              <button
                type="button"
                aria-label={`Remove ${value.label}`}
                onClick={() => onChange(values.filter((item) => item.label !== value.label))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={input}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(event) => {
              setInput(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                void add();
              } else if (event.key === "Backspace" && !input && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
            placeholder={
              values.length ? "Add another…" : `Type or choose ${title.toLocaleLowerCase()}…`
            }
            disabled={creating}
          />
        </div>
        {open && (matching.length > 0 || input.trim()) ? (
          <div className="tag-suggestions">
            {matching.map((item) => (
              <button
                type="button"
                key={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange([
                    ...values,
                    { definitionId: item.id, label: item.label, locked: false },
                  ]);
                  setInput("");
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
            {input.trim() &&
            !suggestions.some(
              (item) => item.label.toLocaleLowerCase() === input.trim().toLocaleLowerCase(),
            ) ? (
              <button
                type="button"
                className="create-tag"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void add()}
              >
                Create “{input.trim()}”
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function _IngredientGroup({
  title,
  items,
  selected,
  onToggle,
  onLock,
}: {
  title: string;
  items: Array<{ id: string; label: string }>;
  selected: Value[];
  onToggle: (item: Value) => void;
  onLock: (label: string) => void;
}) {
  return (
    <section className="ingredient-group">
      <h3>{title}</h3>
      <div className="chip-cloud">
        {items.map((item) => {
          const active = selected.some((value) => value.label === item.label);
          return (
            <button
              type="button"
              key={item.id}
              className={active ? "chip active" : "chip"}
              title={
                selected.find((value) => value.label === item.label)?.locked
                  ? "Locked for randomization"
                  : "Shift-click a selected value to lock it"
              }
              onClick={(event) =>
                event.shiftKey && active
                  ? onLock(item.label)
                  : onToggle({ definitionId: item.id, label: item.label, locked: false })
              }
            >
              {selected.find((value) => value.label === item.label)?.locked ? "◆ " : ""}
              {item.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
