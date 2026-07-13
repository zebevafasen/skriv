import type { TagPack, TagPackCatalog } from "@asterism/contracts";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./AppShell.js";
import { useAppDialog } from "./DialogProvider.js";
import type { CatalogDefinition } from "./TagPackPicker.js";

type IngredientLabels = { genres: string[]; themes: string[]; tags: string[] };

export function TagPackCatalogManager({
  open,
  catalog,
  definitions,
  initialIngredients,
  onClose,
  onChanged,
}: {
  open: boolean;
  catalog: TagPackCatalog;
  definitions: CatalogDefinition[];
  initialIngredients?: IngredientLabels | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const dialog = useAppDialog();
  const [categoryName, setCategoryName] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [collectionCategoryId, setCollectionCategoryId] = useState("");
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [packCollectionId, setPackCollectionId] = useState("");
  const [ingredientText, setIngredientText] = useState({ genres: "", themes: "", tags: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const definitionById = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  const fallbackCollection =
    catalog.collections.find((collection) => collection.name === "Unsorted" && collection.ownership === "user") ??
    catalog.collections[0];

  const resetPack = () => {
    setEditingPackId(null);
    setPackName("");
    setPackDescription("");
    setPackCollectionId(fallbackCollection?.id ?? "");
    setIngredientText({
      genres: initialIngredients?.genres.join(", ") ?? "",
      themes: initialIngredients?.themes.join(", ") ?? "",
      tags: initialIngredients?.tags.join(", ") ?? "",
    });
  };

  useEffect(() => {
    if (!open) return;
    setCollectionCategoryId((current) => current || catalog.categories[0]?.id || "");
    setPackCollectionId((current) => current || fallbackCollection?.id || "");
    if (!editingPackId && initialIngredients) {
      setIngredientText({
        genres: initialIngredients.genres.join(", "),
        themes: initialIngredients.themes.join(", "),
        tags: initialIngredients.tags.join(", "),
      });
    }
  }, [catalog.categories, editingPackId, fallbackCollection?.id, initialIngredients, open]);

  if (!open) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const renameNode = async (kind: "categories" | "collections", id: string, name: string) => {
    const next = await dialog.prompt({
      title: `Rename ${kind === "categories" ? "category" : "collection"}`,
      label: "Name",
      initialValue: name,
    });
    if (!next?.trim()) return;
    await run(async () => {
      await api(`/api/tag-pack-${kind}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next.trim() }),
      });
    });
  };

  const deleteNode = async (kind: "categories" | "collections", id: string, name: string) => {
    if (
      !(await dialog.confirm({
        title: `Delete “${name}”?`,
        body: "Contained custom packs will be preserved in My Packs → Unsorted.",
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    await run(async () => {
      await api(`/api/tag-pack-${kind}/${id}`, { method: "DELETE" });
    });
  };

  const editPack = (pack: TagPack) => {
    setEditingPackId(pack.id);
    setPackName(pack.name);
    setPackDescription(pack.description);
    setPackCollectionId(pack.collectionId);
    setIngredientText({
      genres: pack.values.genres.map((id) => definitionById.get(id)?.label ?? id).join(", "),
      themes: pack.values.themes.map((id) => definitionById.get(id)?.label ?? id).join(", "),
      tags: pack.values.tags.map((id) => definitionById.get(id)?.label ?? id).join(", "),
    });
  };

  const labels = (value: string) =>
    [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
  const resolveDefinitions = async (kind: CatalogDefinition["kind"], value: string) =>
    Promise.all(
      labels(value).map(async (label) => {
        const existing = definitions.find(
          (definition) =>
            definition.kind === kind &&
            definition.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
        );
        if (existing) return existing.id;
        const created = await api<CatalogDefinition>("/api/ideation/definitions", {
          method: "POST",
          body: JSON.stringify({ kind, label }),
        });
        return created.id;
      }),
    );

  return (
    <div className="modal-backdrop tag-catalog-manager-backdrop">
      <div
        className="modal tag-catalog-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-catalog-manager-title"
      >
        <header>
          <div>
            <p className="eyebrow">Tag catalog</p>
            <h2 id="tag-catalog-manager-title">Manage packs</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error ? <ErrorNotice error={error} /> : null}
        <div className="tag-manager-columns">
          <section>
            <h3>Categories</h3>
            <p className="hint">Built-in categories are fixed. Custom categories can sit beside them.</p>
            <div className="tag-manager-list">
              {catalog.categories.filter((item) => item.ownership === "user").map((category) => (
                <div key={category.id}>
                  <span>{category.name}{category.protected ? " · protected" : ""}</span>
                  <span className="tag-manager-actions">
                    <button type="button" className="icon-button" onClick={() => renameNode("categories", category.id, category.name)}><Pencil size={13} /></button>
                    {!category.protected ? <button type="button" className="icon-button danger" onClick={() => deleteNode("categories", category.id, category.name)}><Trash2 size={13} /></button> : null}
                  </span>
                </div>
              ))}
            </div>
            <form
              className="inline-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!categoryName.trim()) return;
                void run(async () => {
                  await api("/api/tag-pack-categories", { method: "POST", body: JSON.stringify({ name: categoryName.trim() }) });
                  setCategoryName("");
                });
              }}
            >
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="New category" />
              <button type="submit" className="button ghost compact" disabled={busy || !categoryName.trim()}><Plus size={13} /> Add</button>
            </form>

            <h3>Collections</h3>
            <div className="tag-manager-list">
              {catalog.collections.filter((item) => item.ownership === "user").map((collection) => (
                <div key={collection.id}>
                  <span>{collection.name}{collection.protected ? " · protected" : ""}</span>
                  <span className="tag-manager-actions">
                    <select
                      aria-label={`Parent category for ${collection.name}`}
                      value={collection.categoryId}
                      disabled={busy || collection.protected}
                      onChange={(event) => void run(async () => {
                        await api(`/api/tag-pack-collections/${collection.id}`, { method: "PATCH", body: JSON.stringify({ categoryId: event.target.value }) });
                      })}
                    >
                      {catalog.categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.ownership})</option>)}
                    </select>
                    <button type="button" className="icon-button" onClick={() => renameNode("collections", collection.id, collection.name)}><Pencil size={13} /></button>
                    {!collection.protected ? <button type="button" className="icon-button danger" onClick={() => deleteNode("collections", collection.id, collection.name)}><Trash2 size={13} /></button> : null}
                  </span>
                </div>
              ))}
            </div>
            <form
              className="inline-create-form stacked"
              onSubmit={(event) => {
                event.preventDefault();
                if (!collectionName.trim() || !collectionCategoryId) return;
                void run(async () => {
                  await api("/api/tag-pack-collections", { method: "POST", body: JSON.stringify({ name: collectionName.trim(), categoryId: collectionCategoryId }) });
                  setCollectionName("");
                });
              }}
            >
              <select value={collectionCategoryId} onChange={(event) => setCollectionCategoryId(event.target.value)}>
                {catalog.categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.ownership})</option>)}
              </select>
              <div><input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="New collection" /><button type="submit" className="button ghost compact" disabled={busy || !collectionName.trim()}><Plus size={13} /> Add</button></div>
            </form>
          </section>

          <section>
            <div className="tag-manager-pack-heading">
              <h3>{editingPackId ? "Edit pack" : "Create pack"}</h3>
              {editingPackId ? <button type="button" className="button ghost compact" onClick={resetPack}>New pack</button> : null}
            </div>
            <form
              className="tag-pack-editor"
              onSubmit={(event) => {
                event.preventDefault();
                if (!packName.trim() || !packCollectionId) return;
                void run(async () => {
                  const values = {
                    genres: await resolveDefinitions("genre", ingredientText.genres),
                    themes: await resolveDefinitions("theme", ingredientText.themes),
                    tags: await resolveDefinitions("tag", ingredientText.tags),
                  };
                  await api(editingPackId ? `/api/tag-packs/${editingPackId}` : "/api/tag-packs", {
                    method: editingPackId ? "PATCH" : "POST",
                    body: JSON.stringify({ name: packName.trim(), description: packDescription, collectionId: packCollectionId, values }),
                  });
                  resetPack();
                });
              }}
            >
              <label><span>Name</span><input value={packName} onChange={(event) => setPackName(event.target.value)} /></label>
              <label><span>Description</span><textarea value={packDescription} onChange={(event) => setPackDescription(event.target.value)} /></label>
              <label><span>Collection</span><select value={packCollectionId} onChange={(event) => setPackCollectionId(event.target.value)}>{catalog.collections.map((collection) => <option key={collection.id} value={collection.id}>{catalog.categories.find((category) => category.id === collection.categoryId)?.name} → {collection.name} ({collection.ownership})</option>)}</select></label>
              {(["genres", "themes", "tags"] as const).map((kind) => (
                <label key={kind}>
                  <span>{kind[0]?.toUpperCase()}{kind.slice(1)} <small>comma-separated; new labels become custom definitions</small></span>
                  <textarea value={ingredientText[kind]} onChange={(event) => setIngredientText((current) => ({ ...current, [kind]: event.target.value }))} />
                </label>
              ))}
              <button type="submit" className="button primary" disabled={busy || !packName.trim() || !packCollectionId}>{busy ? "Saving…" : editingPackId ? "Save pack" : "Create pack"}</button>
            </form>

            <h3>Custom packs</h3>
            <div className="tag-manager-list pack-list">
              {catalog.packs.filter((pack) => pack.ownership === "user").map((pack) => (
                <div key={pack.id}>
                  <span>{pack.name}<small>{catalog.collections.find((collection) => collection.id === pack.collectionId)?.name}</small></span>
                  <span className="tag-manager-actions">
                    <button type="button" className="icon-button" onClick={() => editPack(pack)}><Pencil size={13} /></button>
                    <button type="button" className="icon-button danger" onClick={async () => {
                      if (!(await dialog.confirm({ title: `Delete “${pack.name}”?`, body: "Projects that imported it keep their snapshot.", confirmLabel: "Delete pack", destructive: true }))) return;
                      await run(async () => { await api(`/api/tag-packs/${pack.id}`, { method: "DELETE" }); if (editingPackId === pack.id) resetPack(); });
                    }}><Trash2 size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
