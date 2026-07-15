import { type CompendiumEntry, type Project, storyLanguages } from "@asterism/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Book, Image as ImageIcon, Info, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { asterism } from "../api.js";
import { useAppDialog } from "./DialogProvider.js";

export function ProjectSettingsPanel({
  projectId,
  project,
  entries,
}: {
  projectId: string;
  project: Project;
  entries: CompendiumEntry[];
}) {
  const [activeTab, setActiveTab] = useState<"metadata" | "writing">("metadata");
  const dialog = useAppDialog();
  const client = useQueryClient();
  const [authorDraft, setAuthorDraft] = useState(project.settings.author);
  const authorFocused = useRef(false);
  const authorProjectId = useRef(project.id);

  useEffect(() => {
    const projectChanged = authorProjectId.current !== project.id;
    authorProjectId.current = project.id;
    if (projectChanged || !authorFocused.current) setAuthorDraft(project.settings.author);
  }, [project.id, project.settings.author]);

  const updateSetting = useCallback(
    async (field: string, value: unknown) => {
      await asterism().projects.update(projectId, { settings: { [field]: value } });
      await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
    },
    [client, projectId],
  );

  const updateTitle = async (title: string) => {
    if (title === project.title) return;
    await asterism().projects.update(projectId, { title });
    await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
  };

  const handleCoverUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        await updateSetting("coverDataUrl", result);
      };
      reader.readAsDataURL(file);
    },
    [updateSetting],
  );

  return (
    <div className="project-settings-panel">
      <nav className="settings-tabs">
        <button
          type="button"
          className={activeTab === "metadata" ? "active" : ""}
          onClick={() => setActiveTab("metadata")}
        >
          <Info size={16} /> Metadata
        </button>
        <button
          type="button"
          className={activeTab === "writing" ? "active" : ""}
          onClick={() => setActiveTab("writing")}
        >
          <Book size={16} /> Writing
        </button>
      </nav>

      <div className="settings-content">
        {activeTab === "metadata" && (
          <div className="settings-grid">
            <div className="settings-col">
              <section className="settings-card">
                <h3>METADATA</h3>
                <p className="card-description">
                  This is the metadata of your novel, used for organizing your novel collection.
                </p>
                <label className="settings-input-group">
                  <span className="input-label">Novel Title</span>
                  <input
                    type="text"
                    defaultValue={project.title}
                    onBlur={(e) => updateTitle(e.target.value)}
                  />
                </label>
                <label className="settings-input-group">
                  <span className="input-label">Author / Pen name</span>
                  <input
                    type="text"
                    value={authorDraft}
                    onFocus={() => {
                      authorFocused.current = true;
                    }}
                    onChange={(event) => setAuthorDraft(event.target.value)}
                    onBlur={async () => {
                      authorFocused.current = false;
                      if (authorDraft !== project.settings.author)
                        await updateSetting("author", authorDraft);
                    }}
                  />
                </label>
                <div className="settings-row-group">
                  <label className="settings-input-group flex-1">
                    <span className="input-label">Series (optional)</span>
                    <div className="select-with-button">
                      <select
                        value={project.settings.series}
                        onChange={(e) => updateSetting("series", e.target.value)}
                      >
                        <option value="">Select</option>
                        {project.settings.series && (
                          <option value={project.settings.series}>{project.settings.series}</option>
                        )}
                      </select>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={async () => {
                          const newSeries = await dialog.prompt({
                            title: "New Series",
                            label: "Series Name",
                            initialValue: "",
                          });
                          if (newSeries) {
                            await updateSetting("series", newSeries);
                          }
                        }}
                      >
                        New Series
                      </button>
                    </div>
                  </label>
                  <label className="settings-input-group flex-1">
                    <span className="input-label">Series index</span>
                    <input
                      type="text"
                      defaultValue={project.settings.seriesIndex}
                      placeholder="e.g. Book 1"
                      onBlur={(e) => updateSetting("seriesIndex", e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="settings-card danger-zone">
                <h3>DANGER ZONE</h3>
                <p className="card-description">
                  Some actions in this section cannot be undone and may have unintended
                  consequences.
                </p>
                <div className="danger-actions">
                  <button
                    type="button"
                    className="button destructive ghost"
                    onClick={async () => {
                      if (
                        await dialog.confirm({
                          title: "Delete Novel?",
                          body: "This cannot be undone.",
                          destructive: true,
                          confirmLabel: "Delete",
                        })
                      ) {
                        await asterism().projects.remove(projectId);
                        window.location.assign("/");
                      }
                    }}
                  >
                    <Trash2 size={14} /> Delete Novel
                  </button>
                </div>
              </section>
            </div>

            <div className="settings-col">
              <section className="settings-card cover-card">
                <h3>COVER</h3>
                <p className="card-description">
                  This is the cover of your novel. It will be displayed on the novel collection
                  page.
                </p>
                <div className="cover-upload-header">
                  <label className="button ghost file-upload-btn">
                    Upload your cover
                    <input type="file" accept="image/*" onChange={handleCoverUpload} hidden />
                  </label>
                  <span className="hint">or drag and drop on the area</span>
                </div>
                <div className="cover-preview-area">
                  {project.settings.coverDataUrl ? (
                    <img
                      src={project.settings.coverDataUrl}
                      alt="Cover Preview"
                      className="cover-image"
                    />
                  ) : (
                    <div className="cover-placeholder">
                      <ImageIcon size={48} className="placeholder-icon" />
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === "writing" && (
          <div className="settings-grid">
            <div className="settings-col">
              <section className="settings-card">
                <h3>LABELS/MARKERS</h3>
                <p className="card-description">
                  Use these to organize your scenes by status, subplot, etc. You can also prefix
                  them with a group (e.g. "Status: Draft").
                </p>
                <div className="labels-placeholder">
                  <div className="labels-actions">
                    <button type="button" className="button ghost" disabled>
                      + Add Label
                    </button>
                    <button type="button" className="button ghost" disabled>
                      Sort Labels
                    </button>
                    <button type="button" className="button ghost icon-only" disabled>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="labels-presets">
                    <span className="preset-title">Presets</span>
                    <p className="hint">We have some presets for you to get started:</p>
                    <div className="preset-buttons">
                      <button type="button" className="button ghost" disabled>
                        Scene status
                      </button>
                      <button type="button" className="button ghost" disabled>
                        Temporal setting
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="settings-col">
              <section className="settings-card prose-card">
                <h3>PROSE</h3>

                <div className="settings-field">
                  <div className="field-header">
                    <h4>Tense</h4>
                  </div>
                  <p className="card-description">
                    This is the tense of your novel. It will be passed on to the AI for prose
                    generation.
                  </p>
                  <div className="settings-toggle-group">
                    <button
                      type="button"
                      className={project.settings.tense === "Past" ? "active" : ""}
                      onClick={() => updateSetting("tense", "Past")}
                    >
                      Past
                    </button>
                    <button
                      type="button"
                      className={project.settings.tense === "Present" ? "active" : ""}
                      onClick={() => updateSetting("tense", "Present")}
                    >
                      Present
                    </button>
                  </div>
                </div>

                <div className="settings-field">
                  <div className="field-header">
                    <h4>Language</h4>
                  </div>
                  <p className="card-description">
                    This is the language of your novel. It is used for language-aware writing
                    tools, AI instructions, and hyphenation.
                  </p>
                  <select
                    value={project.settings.language}
                    onChange={(e) => updateSetting("language", e.target.value)}
                    className="full-width"
                  >
                    {storyLanguages.map((language) => (
                      <option value={language} key={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <div className="field-header">
                    <h4>Point of View</h4>
                  </div>
                  <p className="card-description">
                    This is the general point of view of your novel. It will be passed on to the AI
                    for prose generation.
                  </p>
                  <div className="pov-grid">
                    <span className="pov-label">Type</span>
                    <div className="settings-toggle-group wrap">
                      {[
                        "1st Person",
                        "2nd Person",
                        "3rd Person",
                        "3rd Person (Limited)",
                        "3rd Person (Omniscient)",
                      ].map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={project.settings.povType === type ? "active" : ""}
                          onClick={() => updateSetting("povType", type)}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    <span className="pov-label">Character</span>
                    <div className="character-select-group">
                      <select
                        value={project.settings.povCharacterEntryId ?? ""}
                        onChange={(e) =>
                          updateSetting("povCharacterEntryId", e.target.value || null)
                        }
                      >
                        <option value="">Select Character</option>
                        {entries
                          .filter((e) => e.typeId.includes("character"))
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                      </select>
                      {project.settings.povCharacterEntryId && (
                        <button
                          type="button"
                          className="button ghost icon-only"
                          title="Clear character"
                          onClick={() => updateSetting("povCharacterEntryId", null)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
