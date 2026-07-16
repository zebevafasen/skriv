import { mergeAttributes, Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Activity, ChevronDown, Eraser, Play, Trash } from "lucide-react";
import { MentionEditor } from "../MentionEditor.js";
import { ModelSelect } from "../ModelSelect.js";
import { useEditorActions } from "./EditorActionsContext.js";

function SceneBeatView(props: NodeViewProps) {
  const { aiConfigured, baseModel, entries, models, startGeneration } = useEditorActions();

  const {
    instructions,
    targetLength,
    lengthUnit,
    modelOverride,
    workflow,
    eventTarget,
    collapsed,
  } = props.node.attrs;

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

  const clearBelow = () => {
    const start = props.getPos();
    if (start === undefined) return;
    const from = start + props.node.nodeSize;
    const resolved = props.editor.state.doc.resolve(start);
    let sceneDepth = -1;
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      if (resolved.node(depth).type.name === "sceneBlock") {
        sceneDepth = depth;
        break;
      }
    }
    if (sceneDepth < 0) return;
    const sceneEnd = resolved.before(sceneDepth) + resolved.node(sceneDepth).nodeSize - 1;
    let to = sceneEnd;
    let found = false;
    props.editor.state.doc.nodesBetween(from, sceneEnd, (node, pos) => {
      if (!found && node.type.name === "sceneBeat") {
        to = pos;
        found = true;
      }
      return !found;
    });
    if (to > from) props.editor.view.dispatch(props.editor.state.tr.delete(from, to));
  };

  return (
    <NodeViewWrapper className="scene-beat-card" contentEditable={false}>
      <div className="scene-beat-header">
        <span className="scene-beat-title">
          <Activity size={14} /> SCENE BEAT
        </span>
        <div className="scene-beat-actions">
          <span className="scene-beat-summary">
            {workflow.replace("prose.", "")} ·{" "}
            {targetLength === null ? "No limit" : `${targetLength} ${lengthUnit}`} ·{" "}
            {modelOverride ?? baseModel}
          </span>
          <button
            type="button"
            onClick={clearBelow}
            className="icon-button"
            title="Clear prose until the next Scene Beat"
          >
            <Eraser size={14} />
          </button>
          <button
            type="button"
            onClick={() => updateAttr("collapsed", !collapsed)}
            className="icon-button"
            title={collapsed ? "Expand beat" : "Collapse beat"}
          >
            <ChevronDown size={14} className={collapsed ? "collapsed" : ""} />
          </button>
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

      {!collapsed ? (
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

          <MentionEditor
            ariaLabel="Scene Beat instructions"
            className="scene-beat-editor"
            spellCheck={false}
            placeholder={
              workflow === "prose.start"
                ? "Describe how the scene should start..."
                : "Describe what should happen next..."
            }
            value={instructions}
            entries={entries}
            onValueChange={(value) => updateAttr("instructions", value)}
          />

          {workflow === "prose.toward_event" && (
            <MentionEditor
              ariaLabel="Scene Beat goal"
              className="scene-beat-editor"
              spellCheck={false}
              wrapperClassName="scene-beat-event"
              placeholder="Describe what the final event of this generation should be..."
              value={eventTarget || ""}
              entries={entries}
              onValueChange={(value) => updateAttr("eventTarget", value)}
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
                  title="Write until the instructions are complete and the prose reaches a natural stopping point"
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
                    localStorage.setItem("skriv-latest-model", v);
                  }}
                  models={models}
                />
              </div>
              <button
                type="button"
                className="generate-btn"
                disabled={!aiConfigured}
                title={aiConfigured ? "Generate prose" : "Configure OpenRouter in Settings"}
                onClick={handleGenerate}
              >
                <Play size={14} fill="currentColor" /> Generate
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="scene-beat-collapsed-copy">{instructions || "No beat instructions"}</div>
      )}
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
      collapsed: { default: false },
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
