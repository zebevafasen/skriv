import type {
  CompendiumEntry,
  GenerationRequest,
  GenerationStreamEvent,
  Scene,
} from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Check, History, RefreshCw, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamGeneration } from "../api.js";
import {
  AsterismDecorations,
  setCandidateDecoration,
  setMentionDecorations,
} from "../editor/AsterismDecorations.js";
import { ErrorNotice } from "./AppShell.js";
import { type GenerationOptions, GenerationPanel } from "./GenerationPanel.js";

type ActiveGeneration = {
  id: string | null;
  position: number;
  text: string;
  status: "streaming" | "complete" | "failed";
  options: GenerationOptions;
  contextFallback: boolean;
};

type SceneRevision = {
  id: string;
  version: number;
  reason: string;
  createdAt: string;
};

export function generatedProseContent(text: string): JSONContent[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => {
      const content: JSONContent[] = [];
      paragraph.split("\n").forEach((line, index, lines) => {
        if (line) content.push({ type: "text", text: line });
        if (index < lines.length - 1) content.push({ type: "hardBreak" });
      });
      return { type: "paragraph", ...(content.length ? { content } : {}) };
    });
}

export function SceneEditor({
  initialScene,
  entries,
  baseModel,
  models,
  onSaved,
  onOpenEntry,
}: {
  initialScene: Scene;
  entries: CompendiumEntry[];
  baseModel: string;
  models: Array<{ id: string; name: string }>;
  onSaved: (scene: Scene) => void;
  onOpenEntry: (entryIds: string[], direct: boolean) => void;
}) {
  const [scene, setScene] = useState(initialScene);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<ActiveGeneration | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<SceneRevision[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entriesRef = useRef(entries);
  const versionRef = useRef(initialScene.version);
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef<ActiveGeneration | null>(null);
  const cursorRef = useRef(1);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
        }),
        Placeholder.configure({ placeholder: "Begin the scene… Press / for Asterism." }),
        AsterismDecorations,
      ],
      content: initialScene.document as JSONContent,
      editorProps: {
        attributes: { class: "manuscript-prose", spellcheck: "true" },
        handleKeyDown(view, event) {
          if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            cursorRef.current = view.state.selection.from;
            setMenuOpen(true);
            return true;
          }
          return false;
        },
        handleClick(_view, _position, event) {
          const target = event.target as HTMLElement;
          const decorated = target.closest<HTMLElement>("[data-entry-ids]");
          if (decorated?.dataset.entryIds) {
            onOpenEntry(decorated.dataset.entryIds.split(","), event.ctrlKey || event.metaKey);
            return true;
          }
          return false;
        },
      },
      onSelectionUpdate({ editor: current }) {
        cursorRef.current = current.state.selection.from;
      },
      onUpdate({ editor: current }) {
        if (activeRef.current) return;
        if (mentionTimer.current) clearTimeout(mentionTimer.current);
        mentionTimer.current = setTimeout(() => {
          const mentions = [] as Array<{ from: number; to: number; entryIds: string[] }>;
          current.state.doc.descendants((node, position) => {
            if (!node.isText || !node.text) return;
            for (const match of findMentions(node.text, entriesRef.current)) {
              mentions.push({
                from: position + match.from,
                to: position + match.to,
                entryIds: match.entryIds,
              });
            }
          });
          setMentionDecorations(current, mentions);
        }, 100);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          if (activeRef.current) return;
          try {
            const updated = await api<Scene>(`/api/scenes/${initialScene.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                expectedVersion: versionRef.current,
                document: current.getJSON(),
                plainText: current.getText({ blockSeparator: "\n\n" }),
                revisionReason: "autosave",
              }),
            });
            versionRef.current = updated.version;
            setScene(updated);
            onSaved(updated);
          } catch (saveError) {
            setError(saveError);
          }
        }, 900);
      },
    },
    [initialScene.id],
  );

  useEffect(() => {
    if (initialScene.id === scene.id && initialScene.version <= versionRef.current) return;
    setScene(initialScene);
    versionRef.current = initialScene.version;
    editor?.commands.setContent(initialScene.document as JSONContent);
  }, [initialScene, editor, scene.id]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    entriesRef.current = entries;
    if (!editor) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const mentions = [] as Array<{ from: number; to: number; entryIds: string[] }>;
    editor.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return;
      for (const match of findMentions(node.text, entries)) {
        mentions.push({
          from: position + match.from,
          to: position + match.to,
          entryIds: match.entryIds,
        });
      }
    });
    setMentionDecorations(editor, mentions);
  }, [editor, entries]);

  useEffect(
    () => () => {
      if (mentionTimer.current) clearTimeout(mentionTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    setCandidateDecoration(
      editor,
      active ? { position: active.position, text: active.text } : null,
    );
    editor.setEditable(!active);
  }, [editor, active]);

  const startGeneration = useCallback(
    async (options: GenerationOptions) => {
      if (!editor) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setMenuOpen(false);
      setError(null);
      const position = cursorRef.current;
      const textBefore = editor.state.doc.textBetween(0, position, "\n\n");
      const textAfter = editor.state.doc.textBetween(
        position,
        editor.state.doc.content.size,
        "\n\n",
      );
      const controller = new AbortController();
      abortRef.current = controller;
      setActive({
        id: null,
        position,
        text: "",
        status: "streaming",
        options,
        contextFallback: false,
      });
      const request: GenerationRequest = {
        sceneId: scene.id,
        sceneVersion: versionRef.current,
        workflow: options.workflow,
        cursorPosition: position,
        manuscriptBeforeCursor: textBefore,
        manuscriptAfterCursor: textAfter,
        instructions: options.instructions,
        eventTarget: options.eventTarget,
        targetLength: options.targetLength,
        lengthUnit: options.lengthUnit,
        modelOverride: options.modelOverride,
        promptOverrideId: null,
      };
      try {
        await streamGeneration(
          request,
          (event: GenerationStreamEvent) => {
            if (event.type === "generation.started") {
              setActive((value) => (value ? { ...value, id: event.generationId } : value));
            } else if (event.type === "generation.delta") {
              setActive((value) => (value ? { ...value, text: value.text + event.delta } : value));
            } else if (event.type === "generation.completed") {
              setActive((value) =>
                value
                  ? {
                      ...value,
                      text: event.candidateText,
                      status: "complete",
                      contextFallback: event.contextFallback,
                    }
                  : value,
              );
            } else if (event.type === "generation.failed") {
              setActive((value) => (value ? { ...value, status: "failed" } : value));
              setError(new Error(event.message));
            } else if (event.type === "generation.cancelled") setActive(null);
          },
          controller.signal,
        );
      } catch (generationError) {
        if (!controller.signal.aborted) setError(generationError);
        setActive(null);
      }
    },
    [editor, scene.id],
  );

  const accept = async () => {
    if (!editor || !active?.id) return;
    const original = editor.getJSON();
    editor.commands.insertContentAt(active.position, generatedProseContent(active.text));
    try {
      const updated = await api<Scene>(`/api/generations/${active.id}/accept`, {
        method: "POST",
        body: JSON.stringify({
          expectedSceneVersion: versionRef.current,
          document: editor.getJSON(),
          plainText: editor.getText({ blockSeparator: "\n\n" }),
        }),
      });
      versionRef.current = updated.version;
      setScene(updated);
      setActive(null);
      onSaved(updated);
    } catch (acceptError) {
      editor.commands.setContent(original as JSONContent);
      setError(acceptError);
    }
  };

  const reject = async () => {
    if (active?.id)
      await api(`/api/generations/${active.id}/reject`, { method: "POST" }).catch(setError);
    setActive(null);
  };

  const cancel = async () => {
    abortRef.current?.abort();
    if (active?.id)
      await api(`/api/generations/${active.id}/cancel`, { method: "POST" }).catch(() => undefined);
    setActive(null);
  };

  const loadHistory = async () => {
    try {
      const next = await api<SceneRevision[]>(`/api/scenes/${scene.id}/revisions`);
      setRevisions(next);
      setHistoryOpen(true);
    } catch (historyError) {
      setError(historyError);
    }
  };

  const restoreRevision = async (revisionId: string) => {
    try {
      const restored = await api<Scene>(`/api/scenes/${scene.id}/revisions/${revisionId}/restore`, {
        method: "POST",
      });
      versionRef.current = restored.version;
      setScene(restored);
      editor?.commands.setContent(restored.document as JSONContent);
      onSaved(restored);
      setHistoryOpen(false);
    } catch (restoreError) {
      setError(restoreError);
    }
  };

  return (
    <div className="editor-column">
      <div className="editor-header">
        <div>
          <p className="eyebrow">Scene</p>
          <h2>{scene.title}</h2>
        </div>
        <div className="editor-header-actions">
          <span className="save-state">Version {scene.version}</span>
          <button type="button" className="button ghost" onClick={loadHistory}>
            <History size={14} /> History
          </button>
        </div>
      </div>
      <div className="editor-frame">
        <div className="editor-toolbar">
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={editor?.isActive("bold") ? "active" : ""}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={editor?.isActive("italic") ? "active" : ""}
          >
            <em>I</em>
          </button>
          <span />
          <button
            type="button"
            className="ai-command"
            onClick={() => {
              cursorRef.current = editor?.state.selection.from ?? 1;
              setMenuOpen(true);
            }}
          >
            <Sparkles size={15} /> AI /
          </button>
        </div>
        <EditorContent editor={editor} />
        {menuOpen ? (
          <GenerationPanel
            baseModel={baseModel}
            models={models}
            onClose={() => setMenuOpen(false)}
            onGenerate={startGeneration}
          />
        ) : null}
      </div>
      {active ? (
        <div className="candidate-controls">
          <span>
            {active.status === "streaming" ? (
              <>
                <RefreshCw className="spin" size={15} /> Asterism is writing…
              </>
            ) : active.status === "complete" ? (
              active.contextFallback ? (
                "Candidate ready · conventional context fallback used"
              ) : (
                "Candidate ready"
              )
            ) : (
              "Generation failed"
            )}
          </span>
          <div>
            {active.status === "streaming" ? (
              <button type="button" className="button ghost" onClick={cancel}>
                <X size={15} /> Cancel
              </button>
            ) : (
              <>
                <button type="button" className="button ghost" onClick={reject}>
                  <Trash2 size={15} /> Reject
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    const options = active.options;
                    void reject().then(() => startGeneration(options));
                  }}
                >
                  <RefreshCw size={15} /> Regenerate
                </button>
                <button type="button" className="button primary" onClick={accept}>
                  <Check size={15} /> Accept
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      {historyOpen ? (
        <div className="modal-backdrop">
          <section className="modal revision-modal" aria-label="Scene history">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Recovery</p>
                <h2>Scene history</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
              >
                <X size={16} />
              </button>
            </div>
            <div className="revision-list">
              {revisions.length === 0 ? (
                <p>No previous versions yet.</p>
              ) : (
                revisions.map((revision) => (
                  <div key={revision.id}>
                    <span>
                      <strong>Version {revision.version}</strong>
                      <small>
                        {revision.reason.replaceAll("_", " ")} ·{" "}
                        {new Date(revision.createdAt).toLocaleString()}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => restoreRevision(revision.id)}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
