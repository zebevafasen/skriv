import type { WorkflowKey } from "@asterism/contracts";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { ModelSelect } from "./ModelSelect.js";

export type GenerationOptions = {
  workflow: Extract<WorkflowKey, "prose.start" | "prose.continue" | "prose.toward_event">;
  instructions: string;
  eventTarget: string;
  targetLength: number | null;
  lengthUnit: "words" | "paragraphs";
  modelOverride: string | null;
};

export function GenerationPanel({
  baseModel,
  models,
  onClose,
  onGenerate,
}: {
  baseModel: string;
  models: Array<{ id: string; name: string }>;
  onClose: () => void;
  onGenerate: (options: GenerationOptions) => void;
}) {
  const [workflow, setWorkflow] = useState<GenerationOptions["workflow"]>("prose.continue");
  const [instructions, setInstructions] = useState("");
  const [eventTarget, setEventTarget] = useState("");
  const [length, setLength] = useState<{
    value: number | null;
    unit: GenerationOptions["lengthUnit"];
  }>({ value: 200, unit: "words" });
  const [model, setModel] = useState(
    () => localStorage.getItem("asterism-latest-model") ?? baseModel,
  );

  return (
    <div className="generation-popover" role="dialog" aria-label="AI writing command">
      <div className="popover-title">
        <span>
          <Sparkles size={16} /> Write with Asterism
        </span>
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "135px 1fr", gap: "16px", marginTop: "2px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <button
            type="button"
            className={`workflow-tab ${workflow === "prose.start" ? "active" : ""}`}
            onClick={() => setWorkflow("prose.start")}
          >
            Start
          </button>
          <button
            type="button"
            className={`workflow-tab ${workflow === "prose.continue" ? "active" : ""}`}
            onClick={() => setWorkflow("prose.continue")}
          >
            Continue
          </button>
          <button
            type="button"
            className={`workflow-tab ${workflow === "prose.toward_event" ? "active" : ""}`}
            onClick={() => setWorkflow("prose.toward_event")}
          >
            Toward event
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
          {workflow === "prose.toward_event" ? (
            <label style={{ gap: "4px" }}>
              Target event
              <textarea
                value={eventTarget}
                onChange={(event) => setEventTarget(event.target.value)}
                placeholder="Julia finds the concealed door."
                style={{ minHeight: "60px", padding: "8px 10px" }}
              />
            </label>
          ) : null}
          <label style={{ gap: "4px" }}>
            Additional direction
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Keep the dialogue tense and understated."
              style={{ minHeight: "60px", padding: "8px 10px" }}
            />
          </label>
          <fieldset className="length-presets">
            <legend style={{ marginBottom: "4px" }}>Segment length</legend>
            <div className="segmented" style={{ marginBottom: length.value !== null ? "8px" : "0" }}>
              <button
                type="button"
                className={length.unit === "words" && length.value !== null ? "active" : ""}
                onClick={() => {
                  if (length.unit !== "words" || length.value === null) setLength({ ...length, value: 200, unit: "words" });
                }}
              >
                Words
              </button>
              <button
                type="button"
                className={length.unit === "paragraphs" && length.value !== null ? "active" : ""}
                onClick={() => {
                  if (length.unit !== "paragraphs" || length.value === null) setLength({ ...length, value: 3, unit: "paragraphs" });
                }}
              >
                Paragraphs
              </button>
              <button
                type="button"
                className={length.value === null ? "active" : ""}
                onClick={() => setLength({ ...length, value: null })}
              >
                No Limit
              </button>
            </div>
            {length.value !== null ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  {(length.unit === "words" ? [200, 400, 600] : [1, 3, 5]).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setLength({ ...length, value: val })}
                      style={{
                        padding: "5px 12px",
                        fontSize: "12px",
                        background: length.value === val ? "var(--accent)" : "#171512",
                        color: length.value === val ? "#21160a" : "var(--muted)",
                        border: `1px solid ${length.value === val ? "var(--accent)" : "#3b352d"}`,
                        borderRadius: "5px",
                        cursor: "pointer",
                        fontWeight: length.value === val ? "bold" : "normal"
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#171512", padding: "5px 8px", borderRadius: "6px", border: "1px solid #3b352d", flex: 1 }}>
                  <input
                    type="number"
                    value={length.value}
                    onChange={(e) => setLength({ ...length, value: Number(e.target.value) })}
                    style={{ width: "100%", padding: 0, border: 0, background: "transparent", color: "#fff", fontWeight: "bold", fontSize: "12px" }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>{length.unit}</span>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--faint)", fontSize: "11px", margin: "8px 0 0", fontStyle: "italic" }}>
                AI chooses a natural stopping point for the segment.
              </p>
            )}
          </fieldset>
          <div className="form-field">
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#c4bdb2" }}>Model</span>
            <div style={{ marginTop: "4px" }}>
              <ModelSelect
                value={model}
                onChange={(value) => {
                  setModel(value);
                  localStorage.setItem("asterism-latest-model", value);
                }}
                models={models}
              />
              <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--faint)" }}>Base: {baseModel}</div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="button primary full"
        style={{ marginTop: "10px" }}
        disabled={workflow === "prose.toward_event" && !eventTarget.trim()}
        onClick={() =>
          onGenerate({
            workflow,
            instructions,
            eventTarget,
            targetLength: length.value,
            lengthUnit: length.unit,
            modelOverride: model === baseModel ? null : model,
          })
        }
      >
        <Sparkles size={16} /> Generate
      </button>
    </div>
  );
}
