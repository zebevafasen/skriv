import { mergeAttributes, Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Activity, Play, Trash } from "lucide-react";
import { useEffect, useRef } from "react";
import { ModelSelect } from "../ModelSelect.js";
import { useEditorActions } from "./EditorActionsContext.js";

function autoResize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function SceneBeatView(props: NodeViewProps) {
  const { baseModel, models, startGeneration } = useEditorActions();

  const { instructions, targetLength, lengthUnit, modelOverride, workflow, eventTarget } =
    props.node.attrs;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const eventTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autoResize(textareaRef.current);
    autoResize(eventTextareaRef.current);
  });

  const updateAttr = (key: string, value: unknown) => {
    props.updateAttributes({ [key]: value });
  };

  const handleGenerate = () => {
    const start = props.getPos();
    if (start === undefined) return;
    const pos = start + props.node.nodeSize;
    startGeneration(
      {
        workflow,
        instructions,
        eventTarget: workflow === "prose.toward_event" ? eventTarget : "",
        targetLength,
        lengthUnit,
        modelOverride,
      },
      pos,
    );
  };

  return (
    <NodeViewWrapper className="scene-beat-card" contentEditable={false}>
      <div className="scene-beat-header">
        <span className="scene-beat-title">
          <Activity size={14} /> SCENE BEAT
        </span>
        <div className="scene-beat-actions">
          <button
            type="button"
            onClick={() => props.deleteNode()}
            className="icon-button"
            title="Delete beat"
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      <div className="scene-beat-body">
        <div className="scene-beat-tabs">
          <button
            type="button"
            className={`scene-beat-tab ${workflow === "prose.start" ? "active" : ""}`}
            onClick={() => updateAttr("workflow", "prose.start")}
          >
            Start
          </button>
          <button
            type="button"
            className={`scene-beat-tab ${workflow === "prose.continue" ? "active" : ""}`}
            onClick={() => updateAttr("workflow", "prose.continue")}
          >
            Continue
          </button>
          <button
            type="button"
            className={`scene-beat-tab ${workflow === "prose.toward_event" ? "active" : ""}`}
            onClick={() => updateAttr("workflow", "prose.toward_event")}
          >
            Toward Goal
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className="scene-beat-textarea"
          placeholder={
            workflow === "prose.start"
              ? "Describe how the scene should start..."
              : "Describe what should happen next..."
          }
          value={instructions}
          onChange={(e) => updateAttr("instructions", e.target.value)}
        />

        {workflow === "prose.toward_event" && (
          <textarea
            ref={eventTextareaRef}
            className="scene-beat-textarea"
            placeholder="Describe what the final event of this generation should be..."
            value={eventTarget || ""}
            onChange={(e) => updateAttr("eventTarget", e.target.value)}
            style={{ marginTop: "-8px", borderTop: "1px dashed #3b404a", paddingTop: "12px" }}
          />
        )}

        <div className="scene-beat-controls">
          <div className="length-controls-group">
            <div className="scene-beat-segmented">
              <button
                type="button"
                className={lengthUnit === "words" && targetLength !== null ? "active" : ""}
                onClick={() => {
                  if (lengthUnit !== "words" || targetLength === null) {
                    updateAttr("lengthUnit", "words");
                    updateAttr("targetLength", 200);
                  }
                }}
              >
                Words
              </button>
              <button
                type="button"
                className={lengthUnit === "paragraphs" && targetLength !== null ? "active" : ""}
                onClick={() => {
                  if (lengthUnit !== "paragraphs" || targetLength === null) {
                    updateAttr("lengthUnit", "paragraphs");
                    updateAttr("targetLength", 3);
                  }
                }}
              >
                Paragraphs
              </button>
              <button
                type="button"
                className={targetLength === null ? "active" : ""}
                onClick={() => updateAttr("targetLength", null)}
              >
                No Limit
              </button>
            </div>

            {targetLength !== null && (
              <div className="length-presets-row">
                <div className="length-controls">
                  {(lengthUnit === "words" ? [200, 400, 600] : [1, 3, 5]).map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`length-btn ${targetLength === val ? "active" : ""}`}
                      onClick={() => updateAttr("targetLength", val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="custom-length-input">
                  <input
                    type="number"
                    value={targetLength}
                    onChange={(e) => updateAttr("targetLength", Number(e.target.value))}
                  />
                  <span>{lengthUnit}</span>
                </div>
              </div>
            )}
          </div>

          <div className="model-controls">
            <div className="model-select-wrapper">
              <ModelSelect
                value={modelOverride ?? baseModel}
                onChange={(v) => {
                  updateAttr("modelOverride", v === baseModel ? null : v);
                  localStorage.setItem("asterism-latest-model", v);
                }}
                models={models}
              />
            </div>
            <button type="button" className="generate-btn" onClick={handleGenerate}>
              <Play size={14} fill="currentColor" /> Generate
            </button>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const SceneBeat = Node.create({
  name: "sceneBeat",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      instructions: { default: "" },
      eventTarget: { default: "" },
      targetLength: { default: 200 },
      lengthUnit: { default: "words" },
      modelOverride: { default: null },
      workflow: { default: "prose.continue" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='scene-beat']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "scene-beat" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SceneBeatView);
  },
});
