import type { SceneLabel, SceneLabelColor, SceneLabelPack } from "@skriv/contracts";
import { Layers3, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { skriv } from "../api.js";
import { editableLabelColors, projectLabelLibrary } from "../utils/sceneLabelPacks.js";
import { ErrorNotice } from "./AppShell.js";
import { useAppDialog } from "./DialogProvider.js";

export function LabelPackManager({
  open,
  projectId,
  configuredPacks,
  savedLabels,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  configuredPacks: SceneLabelPack[] | undefined;
  savedLabels: SceneLabel[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const dialog = useAppDialog();
  const library = useMemo(
    () => projectLabelLibrary(configuredPacks, savedLabels),
    [configuredPacks, savedLabels],
  );
  const [draftPacks, setDraftPacks] = useState<SceneLabelPack[]>(library.userPacks);
  const [selectedPackId, setSelectedPackId] = useState("user.default");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<SceneLabelColor>("blue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setDraftPacks(library.userPacks);
    setSelectedPackId((current) =>
      [...library.builtinPacks, ...library.userPacks].some((pack) => pack.id === current)
        ? current
        : "user.default",
    );
    setNewLabelName("");
    setError(null);
  }, [library.builtinPacks, library.userPacks, open]);

  if (!open) return null;

  const allPacks = [...library.builtinPacks, ...draftPacks];
  const selectedPack = allPacks.find((pack) => pack.id === selectedPackId) ?? allPacks[0];
  const updatePack = (packId: string, change: (pack: SceneLabelPack) => SceneLabelPack) =>
    setDraftPacks((current) => current.map((pack) => (pack.id === packId ? change(pack) : pack)));

  const addPack = async () => {
    const name = await dialog.prompt({
      title: "Create label pack",
      label: "Pack name",
      initialValue: "",
    });
    if (!name?.trim()) return;
    const pack: SceneLabelPack = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: "",
      ownership: "user",
      protected: false,
      selectionMode: "single",
      labels: [],
    };
    setDraftPacks((current) => [...current, pack]);
    setSelectedPackId(pack.id);
  };

  const deletePack = async (pack: SceneLabelPack) => {
    if (pack.protected) return;
    if (
      !(await dialog.confirm({
        title: `Delete “${pack.name}”?`,
        body: "The pack will be removed. Labels already assigned to scenes will be preserved in My Labels.",
        confirmLabel: "Delete pack",
        destructive: true,
      }))
    )
      return;
    setDraftPacks((current) => current.filter((candidate) => candidate.id !== pack.id));
    setSelectedPackId("user.default");
  };

  const addLabel = () => {
    if (selectedPack?.ownership !== "user") return;
    const name = newLabelName.trim();
    if (!name) return;
    if (
      allPacks.some((pack) =>
        pack.labels.some((label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase()),
      )
    ) {
      setError(new Error(`A label named “${name}” already exists.`));
      return;
    }
    updatePack(selectedPack.id, (pack) => ({
      ...pack,
      labels: [...pack.labels, { id: crypto.randomUUID(), name, color: newLabelColor }],
    }));
    setNewLabelName("");
    setError(null);
  };

  const save = async () => {
    if (draftPacks.some((pack) => !pack.name.trim())) {
      setError(new Error("Every label pack needs a name."));
      return;
    }
    const labelNames = [...library.builtinPacks, ...draftPacks]
      .flatMap((pack) => pack.labels)
      .map((label) => label.name.trim().toLocaleLowerCase());
    if (labelNames.some((name) => !name)) {
      setError(new Error("Every label needs a name."));
      return;
    }
    if (new Set(labelNames).size !== labelNames.length) {
      setError(new Error("Label names must be unique across your packs."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await skriv().projects.update(projectId, { settings: { labelPacks: draftPacks } });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop label-manager-backdrop">
      <div
        className="modal label-pack-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-pack-manager-title"
      >
        <header className="label-manager-heading">
          <div>
            <p className="eyebrow">Outline organization</p>
            <h2 id="label-pack-manager-title">Manage labels</h2>
            <p>Labels are visual markers and are never included in AI context.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error ? <ErrorNotice error={error} /> : null}
        <div className="label-manager-layout">
          <aside className="label-pack-list">
            <div className="label-pack-list-heading">
              <span>Label packs</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Create pack"
                onClick={addPack}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="label-pack-section-label">Built-in</div>
            {library.builtinPacks.map((pack) => (
              <button
                type="button"
                className={selectedPack?.id === pack.id ? "active" : ""}
                key={pack.id}
                onClick={() => setSelectedPackId(pack.id)}
              >
                <Layers3 size={14} />
                <span>{pack.name}</span>
                <small>{pack.labels.length}</small>
              </button>
            ))}
            <div className="label-pack-section-label">Your packs</div>
            {draftPacks.map((pack) => (
              <button
                type="button"
                className={selectedPack?.id === pack.id ? "active" : ""}
                key={pack.id}
                onClick={() => setSelectedPackId(pack.id)}
              >
                <Layers3 size={14} />
                <span>{pack.name}</span>
                <small>{pack.labels.length}</small>
              </button>
            ))}
            <button type="button" className="button ghost label-add-pack" onClick={addPack}>
              <Plus size={14} /> New pack
            </button>
          </aside>

          <section className="label-pack-editor">
            {selectedPack ? (
              <>
                <header>
                  <div>
                    {selectedPack.ownership === "builtin" ? (
                      <>
                        <span className="label-pack-badge">BUILTIN</span>
                        <h3>{selectedPack.name}</h3>
                      </>
                    ) : (
                      <input
                        className="label-pack-name-input"
                        aria-label="Pack name"
                        value={selectedPack.name}
                        onChange={(event) =>
                          updatePack(selectedPack.id, (pack) => ({
                            ...pack,
                            name: event.target.value,
                          }))
                        }
                      />
                    )}
                    <p>{selectedPack.description || "A single-choice group of visual labels."}</p>
                  </div>
                  <span className="label-selection-mode">Single choice</span>
                  {selectedPack.ownership === "user" && !selectedPack.protected ? (
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Delete ${selectedPack.name}`}
                      onClick={() => deletePack(selectedPack)}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </header>

                <div className="label-definition-list">
                  {selectedPack.labels.length ? (
                    selectedPack.labels.map((label) => (
                      <div className="label-definition-row" key={label.id}>
                        <span className={`label-color-preview color-${label.color}`} />
                        {selectedPack.ownership === "user" ? (
                          <>
                            <input
                              aria-label="Label name"
                              value={label.name}
                              onChange={(event) =>
                                updatePack(selectedPack.id, (pack) => ({
                                  ...pack,
                                  labels: pack.labels.map((candidate) =>
                                    candidate.id === label.id
                                      ? { ...candidate, name: event.target.value }
                                      : candidate,
                                  ),
                                }))
                              }
                            />
                            <select
                              aria-label={`Color for ${label.name}`}
                              value={label.color}
                              onChange={(event) =>
                                updatePack(selectedPack.id, (pack) => ({
                                  ...pack,
                                  labels: pack.labels.map((candidate) =>
                                    candidate.id === label.id
                                      ? {
                                          ...candidate,
                                          color: event.target.value as SceneLabelColor,
                                        }
                                      : candidate,
                                  ),
                                }))
                              }
                            >
                              {editableLabelColors.map((color) => (
                                <option value={color} key={color}>
                                  {color}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="icon-button danger"
                              aria-label={`Delete ${label.name}`}
                              onClick={() =>
                                updatePack(selectedPack.id, (pack) => ({
                                  ...pack,
                                  labels: pack.labels.filter(
                                    (candidate) => candidate.id !== label.id,
                                  ),
                                }))
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <strong>{label.name}</strong>
                            <span className={`scene-label color-${label.color}`}>{label.name}</span>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="label-manager-empty">
                      <Layers3 size={22} />
                      <strong>No labels in this pack yet</strong>
                      <span>Add the first one below.</span>
                    </div>
                  )}
                </div>

                {selectedPack.ownership === "user" ? (
                  <div className="label-definition-create">
                    <input
                      value={newLabelName}
                      maxLength={60}
                      placeholder="New label name"
                      onChange={(event) => setNewLabelName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLabel();
                        }
                      }}
                    />
                    <fieldset className="label-color-palette" aria-label="Label color">
                      {editableLabelColors.map((color) => (
                        <button
                          type="button"
                          key={color}
                          className={`color-${color}${newLabelColor === color ? " active" : ""}`}
                          aria-label={color}
                          title={color}
                          onClick={() => setNewLabelColor(color)}
                        />
                      ))}
                    </fieldset>
                    <button
                      type="button"
                      className="button primary"
                      disabled={!newLabelName.trim()}
                      onClick={addLabel}
                    >
                      <Plus size={14} /> Add label
                    </button>
                  </div>
                ) : (
                  <div className="label-builtin-note">
                    Built-in packs are read-only. Add quick labels to My Labels or create a custom
                    pack.
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
        <footer className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={save}>
            <Save size={15} /> {busy ? "Saving…" : "Save label library"}
          </button>
        </footer>
      </div>
    </div>
  );
}
