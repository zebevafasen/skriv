import type { ManuscriptExportOptions } from "@asterism/contracts";
import { Download, X } from "lucide-react";
import { useState } from "react";

export function ExportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [options, setOptions] = useState<ManuscriptExportOptions>({ format: "json", titlePage: true, actHeadings: true, chapterHeadings: true, sceneHeadings: true, includeEmptyScenes: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const manuscript = options.format !== "json";
  const download = async () => {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) });
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error?.message ?? "Export failed."); }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `asterism-export.${options.format}`;
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); } finally { setPending(false); }
  };
  const toggle = (key: keyof ManuscriptExportOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  return <div className="modal-backdrop"><section className="modal export-dialog" aria-label="Export story">
    <div className="drawer-toolbar"><div><p className="eyebrow">Export</p><h2>Prepare your story</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close export"><X size={17} /></button></div>
    <label className="settings-input-group"><span className="input-label">Format</span><select value={options.format} onChange={(event) => setOptions((current) => ({ ...current, format: event.target.value as ManuscriptExportOptions["format"] }))}><option value="json">Asterism JSON (lossless backup)</option><option value="markdown">Markdown</option><option value="docx">Word document (.docx)</option><option value="pdf">PDF</option></select></label>
    {manuscript ? <div className="export-options">
      <label><input type="checkbox" checked={options.titlePage} onChange={() => toggle("titlePage")} /> Include title and author page</label>
      <label><input type="checkbox" checked={options.actHeadings} onChange={() => toggle("actHeadings")} /> Include Act headings</label>
      <label><input type="checkbox" checked={options.chapterHeadings} onChange={() => toggle("chapterHeadings")} /> Include Chapter headings</label>
      <label><input type="checkbox" checked={options.sceneHeadings} onChange={() => toggle("sceneHeadings")} /> Include Scene headings</label>
      <label><input type="checkbox" checked={options.includeEmptyScenes} onChange={() => toggle("includeEmptyScenes")} /> Include empty Scenes</label>
    </div> : <p className="hint">Includes project settings, manuscript, Compendium categories and entries, ideation data, and project notes.</p>}
    {error ? <p className="error-notice">{error}</p> : null}
    <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={pending} onClick={() => void download()}><Download size={15} /> {pending ? "Exporting…" : "Export"}</button></div>
  </section></div>;
}
