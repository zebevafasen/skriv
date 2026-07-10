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
  }>({ value: 250, unit: "words" });
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
      <div className="segmented">
        <button
          type="button"
          className={workflow === "prose.start" ? "active" : ""}
          onClick={() => setWorkflow("prose.start")}
        >
          Start
        </button>
        <button
          type="button"
          className={workflow === "prose.continue" ? "active" : ""}
          onClick={() => setWorkflow("prose.continue")}
        >
          Continue
        </button>
        <button
          type="button"
          className={workflow === "prose.toward_event" ? "active" : ""}
          onClick={() => setWorkflow("prose.toward_event")}
        >
          Toward event
        </button>
      </div>
      {workflow === "prose.toward_event" ? (
        <label>
          Target event
          <textarea
            value={eventTarget}
            onChange={(event) => setEventTarget(event.target.value)}
            placeholder="Julia finds the concealed door."
          />
        </label>
      ) : null}
      <label>
        Additional direction
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Keep the dialogue tense and understated."
        />
      </label>
      <fieldset className="length-presets">
        <legend>Target length</legend>
        <div className="length-preset-grid">
          {[
            ["Short", 150, "words"],
            ["Medium", 350, "words"],
            ["Long", 750, "words"],
            ["1 paragraph", 1, "paragraphs"],
            ["3 paragraphs", 3, "paragraphs"],
            ["6 paragraphs", 6, "paragraphs"],
          ].map(([label, value, unit]) => (
            <button
              type="button"
              key={label}
              className={length.value === value && length.unit === unit ? "active" : ""}
              onClick={() =>
                setLength({
                  value: value as number,
                  unit: unit as GenerationOptions["lengthUnit"],
                })
              }
            >
              <strong className="length-preset-title">{label}</strong>
              {unit === "words" ? <small>{value} words</small> : null}
            </button>
          ))}
          <button
            type="button"
            className={length.value === null ? "active unlimited" : "unlimited"}
            onClick={() => setLength({ value: null, unit: "words" })}
          >
            <strong className="length-preset-title">No limit</strong>
            <small>Write until complete</small>
          </button>
        </div>
      </fieldset>
      <div className="form-field">
        <span>Model</span>
        <ModelSelect
          value={model}
          onChange={(value) => {
            setModel(value);
            localStorage.setItem("asterism-latest-model", value);
          }}
          models={models}
        />
        <small>Base: {baseModel}</small>
      </div>
      <button
        type="button"
        className="button primary full"
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
