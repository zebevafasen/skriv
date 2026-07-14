import type {
  ProjectIngredientPack,
  IngredientPack,
  IngredientPackCatalog,
} from "@asterism/contracts";
import { Check, ChevronDown, Minus, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type IngredientDefinition = {
  id: string;
  label: string;
  kind: "genre" | "theme" | "tag";
};

export function toggleIngredientPackSelection(
  selectedIds: ReadonlySet<string>,
  packIds: string[],
): string[] {
  const next = new Set(selectedIds);
  const allSelected = packIds.length > 0 && packIds.every((id) => next.has(id));
  for (const id of packIds) allSelected ? next.delete(id) : next.add(id);
  return [...next];
}

export function ingredientPackMatchesSearch(
  pack: IngredientPack,
  collectionName: string,
  query: string,
  definitionById: ReadonlyMap<string, IngredientDefinition>,
) {
  if (!query.trim()) return true;
  const valueLabels = [...pack.values.genres, ...pack.values.themes, ...pack.values.tags]
    .map((id) => definitionById.get(id)?.label ?? "")
    .join(" ");
  return `${pack.name} ${pack.description} ${collectionName} ${valueLabels}`
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

function MixedCheckbox({
  checked,
  mixed,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  label: string;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <span className={`catalog-checkbox${checked ? " checked" : ""}${mixed ? " mixed" : ""}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-label={label}
        disabled={disabled}
        onChange={onChange}
      />
      <span aria-hidden="true">
        {mixed ? (
          <Minus size={12} strokeWidth={3} />
        ) : checked ? (
          <Check size={12} strokeWidth={3} />
        ) : null}
      </span>
    </span>
  );
}

export function IngredientPackPicker({
  catalog,
  selectedIds,
  onSelectionChange,
  definitions = [],
  archivedIngredientPacks = [],
  disabled = false,
  onManage,
}: {
  catalog: IngredientPackCatalog;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (ids: string[]) => void;
  definitions?: IngredientDefinition[];
  archivedIngredientPacks?: ProjectIngredientPack[];
  disabled?: boolean;
  onManage?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<"all" | "builtin" | "user">("all");
  const [sort, setSort] = useState<"catalog" | "name" | "ownership">("catalog");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(catalog.categories.slice(0, 1).map((category) => category.id)),
  );
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const categoryExpansionInitialized = useRef(false);
  const definitionById = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  useEffect(() => {
    const firstCategoryId = catalog.categories[0]?.id;
    if (!categoryExpansionInitialized.current && firstCategoryId) {
      categoryExpansionInitialized.current = true;
      setExpandedCategories(new Set([firstCategoryId]));
    }
  }, [catalog.categories]);

  const updateSelection = (packIds: string[]) => {
    onSelectionChange(toggleIngredientPackSelection(selectedIds, packIds));
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryActive = normalizedQuery.length > 0;
  const visibleCategories = catalog.categories
    .map((category) => {
      const allCollections = catalog.collections.filter(
        (collection) => collection.categoryId === category.id,
      );
      const collections = allCollections
        .map((collection) => {
          const allPacks = catalog.packs.filter((pack) => pack.collectionId === collection.id);
          const filteredPacks = allPacks.filter((pack) => {
            if (ownership !== "all" && pack.ownership !== ownership) return false;
            return ingredientPackMatchesSearch(
              pack,
              `${category.name} ${category.description} ${collection.name} ${collection.description}`,
              query,
              definitionById,
            );
          });
          const packs = [...filteredPacks].sort((a, b) => {
            if (sort === "name") return a.name.localeCompare(b.name);
            if (sort === "ownership")
              return a.ownership.localeCompare(b.ownership) || a.name.localeCompare(b.name);
            return allPacks.indexOf(a) - allPacks.indexOf(b);
          });
          const collectionMatches = `${collection.name} ${collection.description}`
            .toLocaleLowerCase()
            .includes(normalizedQuery);
          const ownershipMatches = ownership === "all" || collection.ownership === ownership;
          const visible =
            packs.length > 0 ||
            (allPacks.length === 0 && ownershipMatches && (!queryActive || collectionMatches));
          return { collection, allPacks, packs, visible };
        })
        .filter(({ visible }) => visible);
      const allPacks = allCollections.flatMap((collection) =>
        catalog.packs.filter((pack) => pack.collectionId === collection.id),
      );
      const categoryMatches = `${category.name} ${category.description}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
      const ownershipMatches = ownership === "all" || category.ownership === ownership;
      const visible =
        collections.length > 0 ||
        (allCollections.length === 0 && ownershipMatches && (!queryActive || categoryMatches));
      return { category, collections, allPacks, visible };
    })
    .filter(({ visible }) => visible);

  return (
    <fieldset className="ingredient-pack-browser">
      <legend>Ingredient packs</legend>
      <div className="ingredient-pack-toolbar">
        <div className="ingredient-pack-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ingredient packs and ingredients"
            aria-label="Search ingredient packs"
          />
        </div>
        <select
          value={ownership}
          onChange={(event) => setOwnership(event.target.value as typeof ownership)}
          aria-label="Filter ingredient packs by ownership"
        >
          <option value="all">All ownership</option>
          <option value="builtin">Built-in</option>
          <option value="user">Custom</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          aria-label="Sort ingredient packs"
        >
          <option value="catalog">Catalog order</option>
          <option value="name">A–Z</option>
          <option value="ownership">Ownership</option>
        </select>
        {onManage ? (
          <button type="button" className="button ghost compact" onClick={onManage}>
            <Settings2 size={14} /> Manage
          </button>
        ) : null}
      </div>
      <div className="ingredient-category-list">
        {visibleCategories.map(({ category, collections, allPacks }) => {
          const categoryPackIds = allPacks.map((pack) => pack.id);
          const categorySelected = categoryPackIds.filter((id) => selectedIds.has(id)).length;
          const categoryFullySelected =
            categoryPackIds.length > 0 && categorySelected === categoryPackIds.length;
          const categoryPartiallySelected = categorySelected > 0 && !categoryFullySelected;
          const categoryExpanded = expandedCategories.has(category.id) || queryActive;
          return (
            <section
              className={`ingredient-category${categoryFullySelected ? " selected" : categoryPartiallySelected ? " partial" : ""}`}
              key={category.id}
            >
              <div className="ingredient-category-heading">
                <MixedCheckbox
                  checked={categoryFullySelected}
                  mixed={categoryPartiallySelected}
                  label={`Select every ingredient pack in ${category.name}`}
                  disabled={disabled || categoryPackIds.length === 0}
                  onChange={() => updateSelection(categoryPackIds)}
                />
                <button
                  type="button"
                  className="ingredient-category-toggle"
                  aria-expanded={categoryExpanded}
                  onClick={() =>
                    setExpandedCategories((current) => {
                      const next = new Set(current);
                      next.has(category.id) ? next.delete(category.id) : next.add(category.id);
                      return next;
                    })
                  }
                >
                  <span className="ingredient-category-copy">
                    <strong>{category.name}</strong>
                    <small>{category.description}</small>
                    <span className="ingredient-hierarchy-counts">
                      {categorySelected}/{categoryPackIds.length} ingredient packs selected
                    </span>
                  </span>
                  <span className={`ownership-badge ${category.ownership}`}>
                    {category.ownership}
                  </span>
                  <ChevronDown size={16} className={categoryExpanded ? "expanded" : ""} />
                </button>
              </div>
              {categoryExpanded ? (
                <div className="ingredient-category-contents">
                  <div className="ingredient-collection-list">
                    {collections.map(({ collection, allPacks: collectionPacks, packs }) => {
                      const packIds = collectionPacks.map((pack) => pack.id);
                      const selectedCount = packIds.filter((id) => selectedIds.has(id)).length;
                      const fullySelected = packIds.length > 0 && selectedCount === packIds.length;
                      const partiallySelected = selectedCount > 0 && !fullySelected;
                      const collectionExpanded =
                        expandedCollections.has(collection.id) || queryActive;
                      return (
                        <section
                          className={`ingredient-collection${fullySelected ? " selected" : partiallySelected ? " partial" : ""}`}
                          key={collection.id}
                        >
                          <div className="ingredient-collection-heading">
                            <MixedCheckbox
                              checked={fullySelected}
                              mixed={partiallySelected}
                              label={`Select every ingredient pack in ${collection.name}`}
                              disabled={disabled || packIds.length === 0}
                              onChange={() => updateSelection(packIds)}
                            />
                            <button
                              type="button"
                              className="ingredient-collection-toggle"
                              aria-expanded={collectionExpanded}
                              onClick={() =>
                                setExpandedCollections((current) => {
                                  const next = new Set(current);
                                  next.has(collection.id)
                                    ? next.delete(collection.id)
                                    : next.add(collection.id);
                                  return next;
                                })
                              }
                            >
                              <span className="ingredient-collection-copy">
                                <strong>{collection.name}</strong>
                                <small>{collection.description}</small>
                                <span className="ingredient-hierarchy-counts">
                                  {selectedCount}/{packIds.length} ingredient packs selected
                                </span>
                              </span>
                              <span className={`ownership-badge ${collection.ownership}`}>
                                {collection.ownership}
                              </span>
                              <ChevronDown
                                size={16}
                                className={collectionExpanded ? "expanded" : ""}
                              />
                            </button>
                          </div>
                          {collectionExpanded ? (
                            <div className="ingredient-pack-grid collection-pack-grid">
                              {packs.map((pack) => (
                                <IngredientPackCard
                                  key={pack.id}
                                  pack={pack}
                                  selected={selectedIds.has(pack.id)}
                                  disabled={disabled}
                                  definitionById={definitionById}
                                  onToggle={() => updateSelection([pack.id])}
                                />
                              ))}
                              {packs.length === 0 ? (
                                <p className="ingredient-pack-empty">
                                  No ingredient packs in this collection yet.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                    {collections.length === 0 ? (
                      <p className="ingredient-pack-empty">No collections in this category yet.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
        {visibleCategories.length === 0 ? (
          <p className="ingredient-pack-empty">No ingredient packs match this view.</p>
        ) : null}
      </div>
      {archivedIngredientPacks.length ? (
        <section className="archived-ingredient-packs">
          <h4>Archived imports</h4>
          <p>These project snapshots are no longer available in the active catalog.</p>
          <div className="ingredient-pack-grid">
            {archivedIngredientPacks.map((pack) => (
              <button
                type="button"
                key={pack.sourcePackId}
                className="ingredient-pack-card selected"
                disabled={disabled}
                onClick={() => updateSelection([pack.sourcePackId])}
              >
                <span className="ingredient-pack-check">
                  <Check size={13} />
                </span>
                <span className="archived-ingredient-pack-copy">
                  <strong>{pack.name}</strong>
                  <small>{pack.description}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </fieldset>
  );
}

function IngredientPackCard({
  pack,
  selected,
  disabled,
  definitionById,
  onToggle,
}: {
  pack: IngredientPack;
  selected: boolean;
  disabled: boolean;
  definitionById: ReadonlyMap<string, IngredientDefinition>;
  onToggle: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const groups = [
    ["Genres", pack.values.genres],
    ["Themes", pack.values.themes],
    ["Tags", pack.values.tags],
  ] as const;
  return (
    <article className={`ingredient-pack-card${selected ? " selected" : ""}`}>
      <button
        type="button"
        className="ingredient-pack-select"
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="ingredient-pack-check" aria-hidden="true">
          {selected ? <Check size={13} strokeWidth={3} /> : null}
        </span>
        <span>
          <strong>{pack.name}</strong>
          <small>{pack.description}</small>
          <span className="ingredient-pack-counts">
            {pack.values.genres.length} genres · {pack.values.themes.length} themes ·{" "}
            {pack.values.tags.length} tags
          </span>
        </span>
        <span className={`ownership-badge ${pack.ownership}`}>{pack.ownership}</span>
      </button>
      <button
        type="button"
        className="ingredient-pack-preview-toggle"
        onClick={() => setPreview(!preview)}
      >
        {preview ? "Hide contents" : "View contents"}
      </button>
      {preview ? (
        <div className="ingredient-pack-preview">
          {groups.map(([label, ids]) =>
            ids.length ? (
              <div key={label}>
                <strong>{label}</strong>
                <span>{ids.map((id) => definitionById.get(id)?.label ?? id).join(", ")}</span>
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </article>
  );
}
