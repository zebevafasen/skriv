import type { ProjectTagPack, TagPack, TagPackCatalog } from "@asterism/contracts";
import { Check, ChevronDown, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type CatalogDefinition = {
  id: string;
  label: string;
  kind: "genre" | "theme" | "tag";
};

export function togglePackSelection(
  selectedIds: ReadonlySet<string>,
  packIds: string[],
): string[] {
  const next = new Set(selectedIds);
  const allSelected = packIds.length > 0 && packIds.every((id) => next.has(id));
  for (const id of packIds) allSelected ? next.delete(id) : next.add(id);
  return [...next];
}

export function packMatchesSearch(
  pack: TagPack,
  collectionName: string,
  query: string,
  definitionById: ReadonlyMap<string, CatalogDefinition>,
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
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function TagPackPicker({
  catalog,
  selectedIds,
  onSelectionChange,
  definitions = [],
  archivedPacks = [],
  disabled = false,
  onManage,
}: {
  catalog: TagPackCatalog;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (ids: string[]) => void;
  definitions?: CatalogDefinition[];
  archivedPacks?: ProjectTagPack[];
  disabled?: boolean;
  onManage?: () => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(catalog.categories[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<"all" | "builtin" | "user">("all");
  const [sort, setSort] = useState<"catalog" | "name" | "ownership">("catalog");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const definitionById = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  useEffect(() => {
    if (!catalog.categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(catalog.categories[0]?.id ?? "");
    }
  }, [activeCategoryId, catalog.categories]);

  const updateSelection = (packIds: string[]) => {
    onSelectionChange(togglePackSelection(selectedIds, packIds));
  };

  const activeCollections = catalog.collections.filter(
    (collection) => collection.categoryId === activeCategoryId,
  );
  const activeCategoryName =
    catalog.categories.find((category) => category.id === activeCategoryId)?.name ?? "";
  const visibleCollections = activeCollections
    .map((collection) => {
      const packs = catalog.packs.filter((pack) => pack.collectionId === collection.id);
      const filtered = packs.filter((pack) => {
        if (ownership !== "all" && pack.ownership !== ownership) return false;
        return packMatchesSearch(
          pack,
          `${activeCategoryName} ${collection.name}`,
          query,
          definitionById,
        );
      });
      const sorted = [...filtered].sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "ownership")
          return a.ownership.localeCompare(b.ownership) || a.name.localeCompare(b.name);
        return packs.indexOf(a) - packs.indexOf(b);
      });
      return { collection, allPacks: packs, packs: sorted };
    })
    .filter(({ collection, packs }) =>
      query.trim()
        ? packs.length > 0 || collection.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        : packs.length > 0,
    );
  const categoryPackIds = activeCollections.flatMap((collection) =>
    catalog.packs.filter((pack) => pack.collectionId === collection.id).map((pack) => pack.id),
  );
  const categorySelected = categoryPackIds.filter((id) => selectedIds.has(id)).length;

  return (
    <fieldset className="tag-pack-browser">
      <legend>Tag packs</legend>
      <div className="tag-pack-toolbar">
        <div className="tag-pack-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search packs and ingredients"
            aria-label="Search tag packs"
          />
        </div>
        <select
          value={ownership}
          onChange={(event) => setOwnership(event.target.value as typeof ownership)}
          aria-label="Filter tag packs by ownership"
        >
          <option value="all">All ownership</option>
          <option value="builtin">Built-in</option>
          <option value="user">Custom</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          aria-label="Sort tag packs"
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
      <div className="tag-category-tabs" role="tablist" aria-label="Tag-pack categories">
        {catalog.categories.map((category) => (
          <button
            type="button"
            role="tab"
            aria-selected={category.id === activeCategoryId}
            className={category.id === activeCategoryId ? "active" : ""}
            key={category.id}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.name}
            <span className={`ownership-badge ${category.ownership}`}>{category.ownership}</span>
          </button>
        ))}
      </div>
      {activeCategoryId ? (
        <div className="tag-category-summary">
          <div className="tag-category-selection">
            <MixedCheckbox
              checked={categoryPackIds.length > 0 && categorySelected === categoryPackIds.length}
              mixed={categorySelected > 0 && categorySelected < categoryPackIds.length}
              label="Select every pack in this category"
              disabled={disabled || categoryPackIds.length === 0}
              onChange={() => updateSelection(categoryPackIds)}
            />
            <strong>{catalog.categories.find((item) => item.id === activeCategoryId)?.name}</strong>
          </div>
          <span>
            {categorySelected}/{categoryPackIds.length} selected
          </span>
        </div>
      ) : null}
      <div className="tag-collection-list">
        {visibleCollections.map(({ collection, allPacks, packs }) => {
          const packIds = allPacks.map((pack) => pack.id);
          const selectedCount = packIds.filter((id) => selectedIds.has(id)).length;
          const isExpanded = expanded.has(collection.id) || Boolean(query.trim());
          return (
            <section className="tag-collection" key={collection.id}>
              <div className="tag-collection-heading">
                <MixedCheckbox
                  checked={packIds.length > 0 && selectedCount === packIds.length}
                  mixed={selectedCount > 0 && selectedCount < packIds.length}
                  label={`Select every pack in ${collection.name}`}
                  disabled={disabled || packIds.length === 0}
                  onChange={() => updateSelection(packIds)}
                />
                <button
                  type="button"
                  className="tag-collection-toggle"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      next.has(collection.id) ? next.delete(collection.id) : next.add(collection.id);
                      return next;
                    })
                  }
                >
                  <span className="tag-collection-copy">
                    <strong>{collection.name}</strong>
                    <small>{selectedCount}/{packIds.length} selected</small>
                  </span>
                  <span className={`ownership-badge ${collection.ownership}`}>
                    {collection.ownership}
                  </span>
                  <ChevronDown size={16} className={isExpanded ? "expanded" : ""} />
                </button>
              </div>
              {isExpanded ? (
                <div className="tag-pack-grid">
                  {packs.map((pack) => (
                    <PackCard
                      key={pack.id}
                      pack={pack}
                      selected={selectedIds.has(pack.id)}
                      disabled={disabled}
                      definitionById={definitionById}
                      onToggle={() => updateSelection([pack.id])}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
        {visibleCollections.length === 0 ? (
          <p className="tag-pack-empty">No packs match this view.</p>
        ) : null}
      </div>
      {archivedPacks.length ? (
        <section className="archived-tag-packs">
          <h4>Archived imports</h4>
          <p>These project snapshots are no longer available in the active catalog.</p>
          <div className="tag-pack-grid">
            {archivedPacks.map((pack) => (
              <button
                type="button"
                key={pack.sourcePackId}
                className="tag-pack-card selected"
                disabled={disabled}
                onClick={() => updateSelection([pack.sourcePackId])}
              >
                <span className="tag-pack-check"><Check size={13} /></span>
                <span className="archived-tag-pack-copy"><strong>{pack.name}</strong><small>{pack.description}</small></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </fieldset>
  );
}

function PackCard({
  pack,
  selected,
  disabled,
  definitionById,
  onToggle,
}: {
  pack: TagPack;
  selected: boolean;
  disabled: boolean;
  definitionById: ReadonlyMap<string, CatalogDefinition>;
  onToggle: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const groups = [
    ["Genres", pack.values.genres],
    ["Themes", pack.values.themes],
    ["Tags", pack.values.tags],
  ] as const;
  return (
    <article className={`tag-pack-card${selected ? " selected" : ""}`}>
      <button type="button" className="tag-pack-select" disabled={disabled} onClick={onToggle}>
        <span className="tag-pack-check" aria-hidden="true">
          {selected ? <Check size={13} strokeWidth={3} /> : null}
        </span>
        <span>
          <strong>{pack.name}</strong>
          <small>{pack.description}</small>
          <span className="tag-pack-counts">
            {pack.values.genres.length} genres · {pack.values.themes.length} themes · {pack.values.tags.length} tags
          </span>
        </span>
        <span className={`ownership-badge ${pack.ownership}`}>{pack.ownership}</span>
      </button>
      <button type="button" className="tag-pack-preview-toggle" onClick={() => setPreview(!preview)}>
        {preview ? "Hide contents" : "View contents"}
      </button>
      {preview ? (
        <div className="tag-pack-preview">
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
