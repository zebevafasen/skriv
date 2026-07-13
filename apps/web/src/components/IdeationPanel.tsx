import type {
  AiSettings,
  CompendiumCategory,
  CompendiumEntry,
  ContentPackage,
  ProjectIngredientPack,
  IngredientPackCatalog,
} from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Dice5, Lock, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./AppShell.js";
import { ModelSelect } from "./ModelSelect.js";
import { IngredientPackPicker } from "./IngredientPackPicker.js";
import { IngredientPackCatalogManager } from "./IngredientPackCatalogManager.js";

type Value = { definitionId: string | null; label: string; locked: boolean };
type Metadata = {
  premise: { kind: "text"; text: string };
  genres: { kind: "selection"; values: Value[] };
  themes: { kind: "selection"; values: Value[] };
  tags: { kind: "selection"; values: Value[] };
};
type Collection = {
  id: string;
  name: string;
  kind: "genre" | "theme" | "tag";
  values: Array<{ definitionId: string | null; label: string }>;
};
type CustomDefinition = { id: string; kind: "genre" | "theme" | "tag"; label: string };
type EntityAlternative = { id: string; name: string; description: string };
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
  const ingredientPackCatalog = useQuery({
    queryKey: ["ingredient-pack-catalog"],
    queryFn: () => api<IngredientPackCatalog>("/api/ingredient-pack-catalog"),
  });
  const importedIngredientPacks = useQuery({
    queryKey: ["project-ingredient-packs", projectId],
    queryFn: () => api<ProjectIngredientPack[]>(`/api/projects/${projectId}/ingredient-packs`),
  });
  const categories = useQuery({
    queryKey: ["compendium-categories", projectId],
    queryFn: () => api<CompendiumCategory[]>(`/api/projects/${projectId}/compendium-categories`),
  });
  const compendium = useQuery({
    queryKey: ["compendium", projectId],
    queryFn: () => api<CompendiumEntry[]>(`/api/projects/${projectId}/compendium`),
  });
  const [mode, setMode] = useState<"premise" | "entity">("premise");
  const [genres, setGenres] = useState<Value[]>([]);
  const [themes, setThemes] = useState<Value[]>([]);
  const [tags, setTags] = useState<Value[]>([]);
  const [premise, setPremise] = useState("");
  const [instructions, setInstructions] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [ingredientPackManagerOpen, setIngredientPackManagerOpen] = useState(false);
  const [entityTypeId, setEntityTypeId] = useState("story.character");
  const [entityContextIds, setEntityContextIds] = useState<string[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityAlternatives, setEntityAlternatives] = useState<EntityAlternative[]>([]);
  useEffect(() => {
    if (metadata.data) {
      setGenres(metadata.data.genres?.values ?? []);
      setThemes(metadata.data.themes?.values ?? []);
      setTags(metadata.data.tags?.values ?? []);
      setPremise(metadata.data.premise?.text ?? "");
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
          genres,
          themes,
          tags,
          count: 3,
          modelOverride: model && model !== settings.data?.baseModel ? model : null,
        }),
      }),
    onSuccess: (result) => setAlternatives(result.alternatives),
  });
  const syncIngredientPacks = useMutation({
    mutationFn: (ingredientPackIds: string[]) =>
      api(`/api/projects/${projectId}/ingredient-packs`, {
        method: "PUT",
        body: JSON.stringify({ ingredientPackIds }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["project-ingredient-packs", projectId] }),
        client.invalidateQueries({ queryKey: ["ideation", projectId] }),
        client.invalidateQueries({ queryKey: ["compendium", projectId] }),
      ]);
    },
  });
  const generateEntity = useMutation({
    mutationFn: () =>
      api<{ alternatives: Array<{ name: string; description: string }> }>(
        `/api/projects/${projectId}/ideation/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            mode: "entity",
            typeId: entityTypeId,
            contextEntryIds: entityContextIds,
            instructions,
            genres,
            themes,
            tags,
            count: 3,
            modelOverride: model && model !== settings.data?.baseModel ? model : null,
          }),
        },
      ),
    onSuccess: (result) =>
      setEntityAlternatives(
        result.alternatives.map((alternative) => ({ ...alternative, id: crypto.randomUUID() })),
      ),
  });
  const createEntity = useMutation({
    mutationFn: (alternative: { name: string; description: string }) =>
      api<CompendiumEntry>(`/api/projects/${projectId}/compendium`, {
        method: "POST",
        body: JSON.stringify({
          name: alternative.name,
          typeId: entityTypeId,
          content: {
            kind: "rich_text",
            plainText: alternative.description,
            document: {
              type: "doc",
              content: alternative.description.split(/\r?\n/).map((line) => ({
                type: "paragraph",
                ...(line ? { content: [{ type: "text", text: line }] } : {}),
              })),
            },
          },
        }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["compendium", projectId] });
    },
  });
  const createDefinition = async (_kind: CustomDefinition["kind"], label: string) =>
    ({ definitionId: null, label, locked: false }) satisfies Value;
  const available = (() => {
    if (!definitions.data || !importedIngredientPacks.data) return null;
    const ids = {
      genres: new Set(importedIngredientPacks.data.flatMap((pack) => pack.values.genres)),
      themes: new Set(importedIngredientPacks.data.flatMap((pack) => pack.values.themes)),
      tags: new Set(importedIngredientPacks.data.flatMap((pack) => pack.values.tags)),
    };
    const custom = definitions.data.customDefinitions;
    return {
      genres: [
        ...definitions.data.package.genres.filter((item) => ids.genres.has(item.id)),
        ...custom.filter((item) => item.kind === "genre" && ids.genres.has(item.id)),
      ],
      themes: [
        ...definitions.data.package.themes.filter((item) => ids.themes.has(item.id)),
        ...custom.filter((item) => item.kind === "theme" && ids.themes.has(item.id)),
      ],
      tags: [
        ...definitions.data.package.tags.filter((item) => ids.tags.has(item.id)),
        ...custom.filter((item) => item.kind === "tag" && ids.tags.has(item.id)),
      ],
    };
  })();
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
  const persistIngredients = () => save.mutate({ genres, themes, tags, premise });

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
      <nav className="ideation-mode-tabs" aria-label="Ideation mode">
        <button
          type="button"
          className={mode === "premise" ? "active" : ""}
          onClick={() => setMode("premise")}
        >
          <Sparkles size={15} /> Premise
        </button>
        <button
          type="button"
          className={mode === "entity" ? "active" : ""}
          onClick={() => setMode("entity")}
        >
          <BookMarked size={15} /> Entity
        </button>
      </nav>
      {definitions.error || metadata.error || ingredientPackCatalog.error || importedIngredientPacks.error ? (
        <ErrorNotice error={definitions.error ?? metadata.error ?? ingredientPackCatalog.error ?? importedIngredientPacks.error} />
      ) : null}
      <div className="ideation-columns">
        <div className="ingredient-stack">
          {available ? (
            <>
              <UnifiedTagInput
                title="Genres"
                kind="genre"
                suggestions={available.genres}
                values={genres}
                onChange={setGenres}
                onCreate={createDefinition}
                onRandomize={() => setGenres(choose(available.genres, rand(1, 2), genres))}
              />
              <UnifiedTagInput
                title="Themes"
                kind="theme"
                suggestions={available.themes}
                values={themes}
                onChange={setThemes}
                onCreate={createDefinition}
                onRandomize={() => setThemes(choose(available.themes, rand(1, 3), themes))}
              />
              <UnifiedTagInput
                title="Tags"
                kind="tag"
                suggestions={available.tags}
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
            <div className="ingredient-pack-section-heading">
              <h3>Ingredient packs</h3>
              <button
                type="button"
                className="button ghost compact"
                disabled={genres.length === 0 && themes.length === 0 && tags.length === 0}
                onClick={() => setIngredientPackManagerOpen(true)}
              >
                Save as ingredient pack
              </button>
            </div>
            <IngredientPackPicker
              catalog={ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }}
              selectedIds={new Set((importedIngredientPacks.data ?? []).map((pack) => pack.sourcePackId))}
              definitions={[
                ...(definitions.data?.package.genres.map((item) => ({ ...item, kind: "genre" as const })) ?? []),
                ...(definitions.data?.package.themes.map((item) => ({ ...item, kind: "theme" as const })) ?? []),
                ...(definitions.data?.package.tags.map((item) => ({ ...item, kind: "tag" as const })) ?? []),
                ...(definitions.data?.customDefinitions ?? []),
              ]}
              archivedIngredientPacks={(importedIngredientPacks.data ?? []).filter(
                (snapshot) => !(ingredientPackCatalog.data?.packs ?? []).some((pack) => pack.id === snapshot.sourcePackId),
              )}
              disabled={syncIngredientPacks.isPending}
              onSelectionChange={(packIds) => syncIngredientPacks.mutate(packIds)}
              onManage={() => setIngredientPackManagerOpen(true)}
            />
          </section>
        </div>
        {mode === "premise" ? (
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
              onClick={() => generate.mutate()}
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
        ) : (
          <div className="premise-workbench entity-workbench">
            <label className="form-field">
              <span>Entity category</span>
              <select
                value={entityTypeId}
                onChange={(event) => setEntityTypeId(event.target.value)}
              >
                <option value="story.character">Character</option>
                <option value="story.location">Location</option>
                <option value="story.object">Object / Item</option>
                <option value="story.faction">Faction</option>
                <option value="story.lore">Lore</option>
                <option value="story.other">Other</option>
                {categories.data?.map((category) => (
                  <option value={`custom.${category.id}`} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Optional Compendium context</span>
              <input
                value={entitySearch}
                onChange={(event) => setEntitySearch(event.target.value)}
                placeholder="Search entries…"
              />
            </label>
            <div className="entity-context-list">
              {(compendium.data ?? [])
                .filter(
                  (entry) =>
                    !entry.singleton &&
                    entry.name.toLocaleLowerCase().includes(entitySearch.toLocaleLowerCase()),
                )
                .map((entry) => (
                  <label key={entry.id}>
                    <input
                      type="checkbox"
                      checked={entityContextIds.includes(entry.id)}
                      onChange={() =>
                        setEntityContextIds((current) =>
                          current.includes(entry.id)
                            ? current.filter((id) => id !== entry.id)
                            : [...current, entry.id],
                        )
                      }
                    />{" "}
                    {entry.name}
                  </label>
                ))}
            </div>
            <label>
              Instructions
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="What should this entity contribute to the story?"
              />
            </label>
            <div className="form-field">
              <span>Entity model</span>
              <ModelSelect value={model} onChange={setModel} models={models.data ?? []} />
            </div>
            <button
              type="button"
              className="button primary full"
              disabled={generateEntity.isPending}
              onClick={() => generateEntity.mutate()}
            >
              <Sparkles size={16} />{" "}
              {generateEntity.isPending ? "Generating…" : "Generate entity alternatives"}
            </button>
            {generateEntity.error || createEntity.error ? (
              <ErrorNotice error={generateEntity.error ?? createEntity.error} />
            ) : null}
            <div className="entity-alternatives">
              {entityAlternatives.map((alternative, index) => (
                <article key={alternative.id}>
                  <input
                    value={alternative.name}
                    onChange={(event) =>
                      setEntityAlternatives((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <textarea
                    value={alternative.description}
                    onChange={(event) =>
                      setEntityAlternatives((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="button ghost"
                    disabled={!alternative.name.trim() || createEntity.isPending}
                    onClick={() => createEntity.mutate(alternative)}
                  >
                    Create Compendium entry
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
      <IngredientPackCatalogManager
        open={ingredientPackManagerOpen}
        catalog={ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }}
        definitions={[
          ...(definitions.data?.package.genres.map((item) => ({ ...item, kind: "genre" as const })) ?? []),
          ...(definitions.data?.package.themes.map((item) => ({ ...item, kind: "theme" as const })) ?? []),
          ...(definitions.data?.package.tags.map((item) => ({ ...item, kind: "tag" as const })) ?? []),
          ...(definitions.data?.customDefinitions ?? []),
        ]}
        initialIngredients={{
          genres: genres.map((value) => value.label),
          themes: themes.map((value) => value.label),
          tags: tags.map((value) => value.label),
        }}
        onClose={() => setIngredientPackManagerOpen(false)}
        onChanged={async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey: ["ingredient-pack-catalog"] }),
            client.invalidateQueries({ queryKey: ["ideation-definitions"] }),
          ]);
        }}
      />
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
