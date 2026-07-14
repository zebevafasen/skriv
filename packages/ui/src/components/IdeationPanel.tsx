import type {
  CompendiumEntry,
  ContentPackage,
  ExtractCompendiumResponse,
} from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookMarked,
  Check,
  ChevronDown,
  Dice5,
  Lock,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { asterism } from "../api.js";
import { ErrorNotice } from "./AppShell.js";
import { ModelSelect } from "./ModelSelect.js";
import { IngredientPackPickerModal, IngredientPackPicker } from "./IngredientPackPicker.js";
import { IngredientPackCatalogManager } from "./IngredientPackCatalogManager.js";
import { MentionTextarea } from "./MentionTextarea.js";

type Value = { definitionId: string | null; label: string; locked: boolean };
type IdeationSavePayload = {
  premise: string;
  genres: Value[];
  themes: Value[];
  tags: Value[];
};
type Collection = {
  id: string;
  name: string;
  kind: "genre" | "theme" | "tag";
  values: Array<{ definitionId: string | null; label: string }>;
};
type CustomDefinition = { id: string; kind: "genre" | "theme" | "tag"; label: string };
type EntityAlternative = { id: string; name: string; description: string };
type ExtractionReview = ExtractCompendiumResponse["suggestions"][number] & {
  selected: boolean;
};
export const DEFAULT_FIRST_SCENE_TARGET_LENGTH = 1_000;

export function prepareExtractionReview(
  suggestions: ExtractCompendiumResponse["suggestions"],
): ExtractionReview[] {
  return suggestions.map((suggestion) => ({
    ...suggestion,
    selected: true,
  }));
}
type Definitions = {
  package: ContentPackage;
  enabled: boolean;
  collections: Collection[];
  customDefinitions: CustomDefinition[];
};

type IdeationMode = "premise" | "entity";

export function IdeationPanel({
  aiConfigured,
  projectId,
  entries,
  firstScene,
  onOpenCompendium,
  onOpenFirstScene,
  onGenerateFirstScene,
}: {
  aiConfigured: boolean;
  projectId: string;
  entries: CompendiumEntry[];
  firstScene: { id: string; plainText: string } | null;
  onOpenCompendium: () => void;
  onOpenFirstScene: () => void;
  onGenerateFirstScene: (options: {
    instructions: string;
    targetLength: number | null;
    lengthUnit: "words" | "paragraphs";
    modelOverride: string | null;
  }) => void;
}) {
  const client = useQueryClient();
  const definitions = useQuery({
    queryKey: ["ideation-definitions"],
    queryFn: () => asterism().ideation.definitions() as Promise<Definitions>,
  });
  const metadata = useQuery({
    queryKey: ["ideation", projectId],
    queryFn: () => asterism().ideation.metadata(projectId),
  });
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => asterism().settings.ai(),
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => asterism().settings.models(),
    enabled: aiConfigured,
  });
  const ingredientPackCatalog = useQuery({
    queryKey: ["ingredient-pack-catalog"],
    queryFn: () => asterism().ideation.catalog(),
  });
  const importedIngredientPacks = useQuery({
    queryKey: ["project-ingredient-packs", projectId],
    queryFn: () => asterism().ideation.projectPacks(projectId),
  });
  const categories = useQuery({
    queryKey: ["compendium-categories", projectId],
    queryFn: () => asterism().compendium.categories(projectId),
  });
  const [mode, setMode] = useState<IdeationMode>("premise");
  const [genres, setGenres] = useState<Value[]>([]);
  const [themes, setThemes] = useState<Value[]>([]);
  const [tags, setTags] = useState<Value[]>([]);
  const [premise, setPremise] = useState("");
  const [instructions, setInstructions] = useState<Record<IdeationMode, string>>({
    premise: "",
    entity: "",
  });
  const [contextEntryIds, setContextEntryIds] = useState<Record<IdeationMode, string[]>>({
    premise: [],
    entity: [],
  });
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [ingredientPackManagerOpen, setIngredientPackManagerOpen] = useState(false);
  const [ingredientPackPickerOpen, setIngredientPackPickerOpen] = useState(false);
  const [entityTypeId, setEntityTypeId] = useState("story.character");
  const [entityAlternatives, setEntityAlternatives] = useState<EntityAlternative[]>([]);
  const [developmentStage, setDevelopmentStage] = useState<"idle" | "choice" | "review" | "setup">(
    "idle",
  );
  const [extractionReview, setExtractionReview] = useState<ExtractionReview[]>([]);
  const [sourcePremiseRevision, setSourcePremiseRevision] = useState<number | null>(null);
  const [openingInstructions, setOpeningInstructions] = useState("");
  const [firstSceneTargetLength, setFirstSceneTargetLength] = useState<number | null>(
    DEFAULT_FIRST_SCENE_TARGET_LENGTH,
  );
  const [firstSceneLengthUnit, setFirstSceneLengthUnit] = useState<"words" | "paragraphs">("words");
  const referenceEntries = useMemo(() => entries.filter((entry) => !entry.singleton), [entries]);
  const persistedValues = useMemo<IdeationSavePayload>(
    () => ({ premise, genres, themes, tags }),
    [genres, premise, tags, themes],
  );
  const persistedSnapshot = JSON.stringify(persistedValues);
  const persistedSnapshotRef = useRef<string | null>(null);
  const hydratedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!metadata.data || hydratedProjectRef.current === projectId) return;
    const loaded: IdeationSavePayload = {
      genres: metadata.data.genres?.values ?? [],
      themes: metadata.data.themes?.values ?? [],
      tags: metadata.data.tags?.values ?? [],
      premise: metadata.data.premise?.text ?? "",
    };
    hydratedProjectRef.current = projectId;
    persistedSnapshotRef.current = JSON.stringify(loaded);
    setGenres(loaded.genres);
    setThemes(loaded.themes);
    setTags(loaded.tags);
    setPremise(loaded.premise);
  }, [metadata.data, projectId]);
  useEffect(() => {
    if (!model && settings.data) {
      setModel(localStorage.getItem("asterism-latest-model") ?? settings.data.baseModel);
    }
  }, [model, settings.data]);
  const save = useMutation({
    mutationFn: (payload: IdeationSavePayload) =>
      asterism().ideation.updateMetadata(projectId, payload),
    onSuccess: async (_result, payload) => {
      persistedSnapshotRef.current = JSON.stringify(payload);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ideation", projectId] }),
        client.invalidateQueries({ queryKey: ["compendium", projectId] }),
      ]);
    },
  });
  useEffect(() => {
    if (
      persistedSnapshotRef.current === null ||
      persistedSnapshotRef.current === persistedSnapshot
    ) {
      return;
    }
    const timeout = window.setTimeout(() => save.mutate(persistedValues), 700);
    return () => window.clearTimeout(timeout);
  }, [persistedSnapshot, persistedValues, save.mutate]);
  const generate = useMutation({
    mutationFn: () =>
      asterism().ideation.generate<string>(projectId, {
        instructions: instructions.premise,
        contextEntryIds: contextEntryIds.premise,
        genres,
        themes,
        tags,
        count: 3,
        modelOverride: model && model !== settings.data?.baseModel ? model : null,
      }),
    onSuccess: (result) => setAlternatives(result.alternatives),
  });
  const syncIngredientPacks = useMutation({
    mutationFn: (ingredientPackIds: string[]) =>
      asterism().ideation.syncProjectPacks(projectId, ingredientPackIds),
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
      asterism().ideation.generate<{ name: string; description: string }>(projectId, {
        mode: "entity",
        typeId: entityTypeId,
        contextEntryIds: contextEntryIds.entity,
        instructions: instructions.entity,
        genres,
        themes,
        tags,
        count: 3,
        modelOverride: model && model !== settings.data?.baseModel ? model : null,
      }),
    onSuccess: (result) =>
      setEntityAlternatives(
        result.alternatives.map((alternative) => ({ ...alternative, id: crypto.randomUUID() })),
      ),
  });
  const createEntity = useMutation({
    mutationFn: (alternative: { name: string; description: string }) =>
      asterism().compendium.create(projectId, {
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
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["compendium", projectId] });
    },
  });
  const extractCompendium = useMutation({
    mutationFn: async () => {
      await save.mutateAsync(persistedValues);
      return asterism().ideation.extractCompendium(projectId, {
        modelOverride: model && model !== settings.data?.baseModel ? model : null,
      });
    },
    onSuccess: (result) => {
      setSourcePremiseRevision(result.sourcePremiseRevision);
      setExtractionReview(prepareExtractionReview(result.suggestions));
      setDevelopmentStage("review");
    },
  });
  const importCompendium = useMutation({
    mutationFn: () => {
      if (sourcePremiseRevision === null) throw new Error("Run extraction again.");
      return asterism().ideation.importCompendium(projectId, {
        sourcePremiseRevision,
        entries: extractionReview
          .filter((entry) => entry.selected)
          .map(({ name, typeId, description, duplicateEntryId, duplicateEntryRevision }) => ({
            name,
            typeId,
            description,
            existingEntryId: duplicateEntryId,
            expectedExistingRevision: duplicateEntryRevision,
          })),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["compendium", projectId] });
      setDevelopmentStage("setup");
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
  const persistIngredients = () => save.mutate(persistedValues);
  const choosePremise = async (alternative: string) => {
    const payload = { ...persistedValues, premise: alternative };
    setPremise(alternative);
    setDevelopmentStage("idle");
    setExtractionReview([]);
    setSourcePremiseRevision(null);
    await save.mutateAsync(payload).catch(() => undefined);
  };
  const duplicateForName = (name: string) => {
    const normalized = name.trim().normalize("NFKC").toLocaleLowerCase();
    return (
      entries.find(
        (entry) =>
          !entry.singleton &&
          [entry.name, ...entry.aliases].some(
            (candidate) => candidate.trim().normalize("NFKC").toLocaleLowerCase() === normalized,
          ),
      ) ?? null
    );
  };
  const developmentPanel = premise.trim() ? (
    <section className="ideation-development">
      <header>
        <span className="eyebrow">Next steps</span>
        <h3>Develop the chosen premise</h3>
      </header>
      {developmentStage === "idle" ? (
        <div className="button-row">
          <button
            type="button"
            className="button ghost"
            disabled={!aiConfigured || extractCompendium.isPending || save.isPending}
            title={aiConfigured ? undefined : "Configure OpenRouter in Settings"}
            onClick={() => extractCompendium.mutate()}
          >
            <BookMarked size={15} />
            {extractCompendium.isPending ? "Extracting…" : "Extract starter entries"}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => setDevelopmentStage("choice")}
          >
            Continue to first scene <ArrowRight size={15} />
          </button>
        </div>
      ) : null}
      {developmentStage === "choice" ? (
        <div className="ideation-transition-choice">
          <h4>Build a starter Compendium first?</h4>
          <p>
            Asterism can extract premise-supported characters, places, objects, factions, and lore
            for you to review before writing.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              disabled={!aiConfigured || extractCompendium.isPending || save.isPending}
              title={aiConfigured ? undefined : "Configure OpenRouter in Settings"}
              onClick={() => extractCompendium.mutate()}
            >
              <Sparkles size={15} />
              {extractCompendium.isPending ? "Extracting…" : "Extract and review"}
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setDevelopmentStage("setup")}
            >
              Skip for now
            </button>
          </div>
        </div>
      ) : null}
      {developmentStage === "review" ? (
        <div className="ideation-extraction-review">
          <div className="ideation-review-heading">
            <div>
              <h4>Review starter entries</h4>
              <p>Edit the factual drafts and select only what should become canonical.</p>
            </div>
            <button
              type="button"
              className="button ghost compact"
              disabled={!aiConfigured || extractCompendium.isPending}
              title={aiConfigured ? undefined : "Configure OpenRouter in Settings"}
              onClick={() => extractCompendium.mutate()}
            >
              Extract again
            </button>
          </div>
          {extractionReview.length ? (
            <div className="ideation-extraction-list">
              {extractionReview.map((draft) => (
                <article
                  className={`ideation-extraction-card ${draft.duplicateEntryId ? "duplicate" : ""}`}
                  key={draft.id}
                >
                  <label className="ideation-extraction-select">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(event) =>
                        setExtractionReview((current) =>
                          current.map((entry) =>
                            entry.id === draft.id
                              ? { ...entry, selected: event.target.checked }
                              : entry,
                          ),
                        )
                      }
                    />
                    Include
                  </label>
                  <div className="ideation-extraction-fields">
                    <label>
                      Name
                      <input
                        value={draft.name}
                        onChange={(event) => {
                          const name = event.target.value;
                          const duplicate = duplicateForName(name);
                          setExtractionReview((current) =>
                            current.map((entry) =>
                              entry.id === draft.id
                                ? {
                                    ...entry,
                                    name,
                                    duplicateEntryId: duplicate?.id ?? null,
                                    duplicateEntryRevision: duplicate?.revision ?? null,
                                  }
                                : entry,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={draft.typeId}
                        onChange={(event) =>
                          setExtractionReview((current) =>
                            current.map((entry) =>
                              entry.id === draft.id
                                ? {
                                    ...entry,
                                    typeId: event.target.value as ExtractionReview["typeId"],
                                  }
                                : entry,
                            ),
                          )
                        }
                      >
                        <option value="story.character">Character</option>
                        <option value="story.location">Location</option>
                        <option value="story.object">Object / Item</option>
                        <option value="story.faction">Faction</option>
                        <option value="story.lore">Lore</option>
                        <option value="story.other">Other</option>
                      </select>
                    </label>
                  </div>
                  <label className="content-field">
                    Description
                    <textarea
                      value={draft.description}
                      onChange={(event) =>
                        setExtractionReview((current) =>
                          current.map((entry) =>
                            entry.id === draft.id
                              ? { ...entry, description: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <blockquote>“{draft.evidence}”</blockquote>
                  {draft.duplicateEntryId ? (
                    <small>
                      An entry with this name or alias already exists. This description will be
                      appended to it as a new paragraph.
                    </small>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p>No clearly supported Compendium entries were found in this premise.</p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              disabled={
                importCompendium.isPending || !extractionReview.some((entry) => entry.selected)
              }
              onClick={() => importCompendium.mutate()}
            >
              <Check size={15} />
              {importCompendium.isPending ? "Importing…" : "Import selected"}
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setDevelopmentStage("setup")}
            >
              Continue without importing
            </button>
          </div>
        </div>
      ) : null}
      {developmentStage === "setup" ? (
        <div className="ideation-first-scene-setup">
          <div>
            <h4>Set up the first Scene</h4>
            <p>The result will open in the editor as a provisional candidate.</p>
          </div>
          <MentionTextarea
            value={openingInstructions}
            entries={referenceEntries}
            placeholder="Optional opening direction…"
            onValueChange={setOpeningInstructions}
          />
          <div className="form-field">
            <span>First Scene model</span>
            <ModelSelect value={model} onChange={setModel} models={models.data ?? []} />
          </div>
          <div className="first-scene-length-controls">
            <div className="scene-beat-segmented">
              <button
                type="button"
                className={
                  firstSceneLengthUnit === "words" && firstSceneTargetLength !== null
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setFirstSceneLengthUnit("words");
                  setFirstSceneTargetLength(DEFAULT_FIRST_SCENE_TARGET_LENGTH);
                }}
              >
                Words
              </button>
              <button
                type="button"
                className={
                  firstSceneLengthUnit === "paragraphs" && firstSceneTargetLength !== null
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setFirstSceneLengthUnit("paragraphs");
                  setFirstSceneTargetLength(5);
                }}
              >
                Paragraphs
              </button>
              <button
                type="button"
                className={firstSceneTargetLength === null ? "active" : ""}
                onClick={() => setFirstSceneTargetLength(null)}
              >
                No limit
              </button>
            </div>
            {firstSceneTargetLength !== null ? (
              <label>
                Target
                <input
                  type="number"
                  min={1}
                  max={10_000}
                  value={firstSceneTargetLength}
                  onChange={(event) =>
                    setFirstSceneTargetLength(
                      Math.max(1, Math.min(10_000, Number(event.target.value))),
                    )
                  }
                />
                <span>{firstSceneLengthUnit}</span>
              </label>
            ) : null}
          </div>
          {firstScene?.plainText.trim() ? (
            <div className="ideation-existing-first-scene">
              <p>The project's first Scene already contains prose.</p>
              <button type="button" className="button primary" onClick={onOpenFirstScene}>
                Open first Scene <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button primary full"
              disabled={!aiConfigured || !firstScene || save.isPending}
              title={aiConfigured ? "Generate the first Scene" : "Configure OpenRouter in Settings"}
              onClick={async () => {
                const saved = await save.mutateAsync(persistedValues).then(
                  () => true,
                  () => false,
                );
                if (!saved) return;
                onGenerateFirstScene({
                  instructions: openingInstructions,
                  targetLength: firstSceneTargetLength,
                  lengthUnit: firstSceneLengthUnit,
                  modelOverride: model && model !== settings.data?.baseModel ? model : null,
                });
              }}
            >
              <Sparkles size={16} /> Generate first Scene
            </button>
          )}
        </div>
      ) : null}
    </section>
  ) : null;

  return (
    <div className="workspace-panel ideation-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Story ideation</p>
          <h2>Find the constellation</h2>
          <p>Combine constraints into a premise with its own gravity.</p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button ghost"
            data-ideation-compendium-trigger
            onClick={onOpenCompendium}
          >
            <BookMarked size={16} /> Compendium
          </button>
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
      {definitions.error ||
      metadata.error ||
      ingredientPackCatalog.error ||
      importedIngredientPacks.error ? (
        <ErrorNotice
          error={
            definitions.error ??
            metadata.error ??
            ingredientPackCatalog.error ??
            importedIngredientPacks.error
          }
        />
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
              <div className="button-row">
                <button
                  type="button"
                  className="button ghost compact"
                  onClick={() => setIngredientPackPickerOpen(true)}
                >
                  Browse ingredient packs
                </button>
                <button
                  type="button"
                  className="button ghost compact"
                  disabled={genres.length === 0 && themes.length === 0 && tags.length === 0}
                  onClick={() => setIngredientPackManagerOpen(true)}
                >
                  Save as ingredient pack
                </button>
              </div>
            </div>
            
            {importedIngredientPacks.data?.length ? (
              <IngredientPackPicker
                catalog={ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }}
                selectedIds={
                  new Set((importedIngredientPacks.data ?? []).map((pack) => pack.sourcePackId))
                }
                definitions={[
                  ...(definitions.data?.package.genres.map((item) => ({
                    ...item,
                    kind: "genre" as const,
                  })) ?? []),
                  ...(definitions.data?.package.themes.map((item) => ({
                    ...item,
                    kind: "theme" as const,
                  })) ?? []),
                  ...(definitions.data?.package.tags.map((item) => ({
                    ...item,
                    kind: "tag" as const,
                  })) ?? []),
                  ...(definitions.data?.customDefinitions ?? []),
                ]}
                archivedIngredientPacks={(importedIngredientPacks.data ?? []).filter(
                  (snapshot) =>
                    !(ingredientPackCatalog.data?.packs ?? []).some(
                      (pack) => pack.id === snapshot.sourcePackId,
                    ),
                )}
                disabled={syncIngredientPacks.isPending}
                onSelectionChange={(packIds) => syncIngredientPacks.mutate(packIds)}
                hideToolbar={true}
                selectedOnly={true}
              />
            ) : (
              <p className="ingredient-pack-empty">No ingredient packs selected.</p>
            )}

            <IngredientPackPickerModal
              open={ingredientPackPickerOpen}
              onClose={() => setIngredientPackPickerOpen(false)}
              catalog={ingredientPackCatalog.data ?? { categories: [], collections: [], packs: [] }}
              selectedIds={
                new Set((importedIngredientPacks.data ?? []).map((pack) => pack.sourcePackId))
              }
              definitions={[
                ...(definitions.data?.package.genres.map((item) => ({
                  ...item,
                  kind: "genre" as const,
                })) ?? []),
                ...(definitions.data?.package.themes.map((item) => ({
                  ...item,
                  kind: "theme" as const,
                })) ?? []),
                ...(definitions.data?.package.tags.map((item) => ({
                  ...item,
                  kind: "tag" as const,
                })) ?? []),
                ...(definitions.data?.customDefinitions ?? []),
              ]}
              archivedIngredientPacks={(importedIngredientPacks.data ?? []).filter(
                (snapshot) =>
                  !(ingredientPackCatalog.data?.packs ?? []).some(
                    (pack) => pack.id === snapshot.sourcePackId,
                  ),
              )}
              disabled={syncIngredientPacks.isPending}
              onSelectionChange={(packIds) => syncIngredientPacks.mutate(packIds)}
              onManage={() => {
                setIngredientPackPickerOpen(false);
                setIngredientPackManagerOpen(true);
              }}
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
            <AdditionalInstructions
              value={instructions.premise}
              entries={referenceEntries}
              selectedIds={contextEntryIds.premise}
              placeholder="Adult gothic tone; let Evelyn complicate the central relationship."
              onValueChange={(value) =>
                setInstructions((current) => ({ ...current, premise: value }))
              }
              onSelectedIdsChange={(ids) =>
                setContextEntryIds((current) => ({ ...current, premise: ids }))
              }
            />
            <button
              type="button"
              className="button primary full"
              disabled={!aiConfigured || generate.isPending}
              title={aiConfigured ? undefined : "Configure OpenRouter in Settings"}
              onClick={() => generate.mutate()}
            >
              <Sparkles size={16} />{" "}
              {generate.isPending ? "Generating…" : "Generate premise alternatives"}
            </button>
            {generate.error ? <ErrorNotice error={generate.error} /> : null}
            <div className="alternative-list">
              {alternatives.map((alternative) => (
                <article key={alternative}>
                  <p>{alternative}</p>
                  <button
                    type="button"
                    className="button ghost compact"
                    disabled={save.isPending}
                    onClick={() => void choosePremise(alternative)}
                  >
                    <Check size={14} /> Use this premise
                  </button>
                </article>
              ))}
            </div>
            <label className="content-field">
              Active premise
              <textarea
                value={premise}
                onChange={(event) => {
                  setPremise(event.target.value);
                  setDevelopmentStage("idle");
                  setSourcePremiseRevision(null);
                  setExtractionReview([]);
                }}
                placeholder="Your project premise will live here…"
              />
            </label>
            <button
              type="button"
              className="button ghost"
              disabled={save.isPending}
              onClick={persistIngredients}
            >
              {save.isPending ? "Saving…" : "Save active premise"}
            </button>
            {save.error || extractCompendium.error || importCompendium.error ? (
              <ErrorNotice
                error={save.error ?? extractCompendium.error ?? importCompendium.error}
              />
            ) : null}
            {developmentPanel}
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
            <AdditionalInstructions
              value={instructions.entity}
              entries={referenceEntries}
              selectedIds={contextEntryIds.entity}
              placeholder="What should this entity contribute to the story?"
              onValueChange={(value) =>
                setInstructions((current) => ({ ...current, entity: value }))
              }
              onSelectedIdsChange={(ids) =>
                setContextEntryIds((current) => ({ ...current, entity: ids }))
              }
            />
            <div className="form-field">
              <span>Entity model</span>
              <ModelSelect value={model} onChange={setModel} models={models.data ?? []} />
            </div>
            <button
              type="button"
              className="button primary full"
              disabled={!aiConfigured || generateEntity.isPending}
              title={aiConfigured ? undefined : "Configure OpenRouter in Settings"}
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
          ...(definitions.data?.package.genres.map((item) => ({
            ...item,
            kind: "genre" as const,
          })) ?? []),
          ...(definitions.data?.package.themes.map((item) => ({
            ...item,
            kind: "theme" as const,
          })) ?? []),
          ...(definitions.data?.package.tags.map((item) => ({ ...item, kind: "tag" as const })) ??
            []),
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

function AdditionalInstructions({
  value,
  entries,
  selectedIds,
  placeholder,
  onValueChange,
  onSelectedIdsChange,
}: {
  value: string;
  entries: CompendiumEntry[];
  selectedIds: string[];
  placeholder: string;
  onValueChange: (value: string) => void;
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const controlRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = selectedIds
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is CompendiumEntry => Boolean(entry));
  const matching = entries.filter((entry) =>
    `${entry.name} ${entry.aliases.join(" ")}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const toggle = (id: string) =>
    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter((entryId) => entryId !== id)
        : [...selectedIds, id],
    );

  return (
    <div className="form-field ideation-instructions-field">
      <div className="ideation-instructions-heading">
        <span>Additional instructions</span>
        <div className="ideation-reference-control" ref={controlRef}>
          <button
            type="button"
            className={`button ghost compact ideation-reference-trigger ${open ? "active" : ""}`}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((current) => !current)}
          >
            <Plus size={13} /> Reference
            {selectedIds.length ? <b>{selectedIds.length}</b> : null}
            <ChevronDown size={13} />
          </button>
          {open ? (
            <div
              className="ideation-reference-menu"
              role="dialog"
              aria-label="Add Compendium reference"
            >
              <div className="ideation-reference-menu-heading">
                <strong>Add Compendium reference</strong>
                <small>Pinned entries are supplied as canonical material.</small>
              </div>
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search entries…"
                aria-label="Search Compendium references"
              />
              <div className="ideation-reference-options">
                {matching.length ? (
                  matching.map((entry) => (
                    <label key={entry.id}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(entry.id)}
                        onChange={() => toggle(entry.id)}
                      />
                      <span>{entry.name}</span>
                      {selectedIds.includes(entry.id) ? <Check size={14} /> : null}
                    </label>
                  ))
                ) : (
                  <p>No matching entries.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {selected.length ? (
        <fieldset className="ideation-reference-chips" aria-label="Pinned Compendium references">
          {selected.map((entry) => (
            <button type="button" key={entry.id} onClick={() => toggle(entry.id)}>
              {entry.name} <X size={12} />
            </button>
          ))}
        </fieldset>
      ) : null}
      <MentionTextarea
        wrapperClassName="ideation-instructions-input"
        className="ideation-instructions-textarea"
        value={value}
        entries={entries}
        onValueChange={onValueChange}
        placeholder={placeholder}
      />
      <small>
        Names and aliases from the Compendium are highlighted and resolved as reference material.
      </small>
    </div>
  );
}

export function clearIngredientValues<T extends { locked: boolean }>(
  values: T[],
  includeLocked = false,
): T[] {
  return includeLocked ? [] : values.filter((value) => value.locked);
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
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const keepSuggestionsOpen = (scrollTop = suggestionsRef.current?.scrollTop ?? 0) => {
    setInput("");
    setOpen(true);
    requestAnimationFrame(() => {
      if (suggestionsRef.current) suggestionsRef.current.scrollTop = scrollTop;
    });
  };
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
      keepSuggestionsOpen();
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
        <div className="ingredient-group-actions">
          {onRandomize ? (
            <button
              type="button"
              className="button ghost ingredient-action"
              onClick={onRandomize}
              title={`Randomize ${title.toLocaleLowerCase()}`}
            >
              <Dice5 size={12} /> Randomize
            </button>
          ) : null}
          <button
            type="button"
            className="button ghost ingredient-action"
            disabled={!values.some((value) => !value.locked)}
            onClick={() => onChange(clearIngredientValues(values))}
            title={`Clear unlocked ${title.toLocaleLowerCase()}`}
          >
            <X size={12} /> Clear
          </button>
          {values.some((value) => value.locked) ? (
            <button
              type="button"
              className="button ghost ingredient-action"
              onClick={() => onChange(clearIngredientValues(values, true))}
              title={`Clear all ${title.toLocaleLowerCase()}, including locked values`}
            >
              <X size={12} /> Clear all
            </button>
          ) : null}
        </div>
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
          <div className="tag-suggestions" ref={suggestionsRef}>
            {matching.map((item) => (
              <button
                type="button"
                key={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const scrollTop = suggestionsRef.current?.scrollTop ?? 0;
                  onChange([
                    ...values,
                    { definitionId: item.id, label: item.label, locked: false },
                  ]);
                  keepSuggestionsOpen(scrollTop);
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
