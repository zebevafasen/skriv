import type {
  CompendiumEntry,
  GenerationRequest,
  GenerationStreamEvent,
  ManuscriptTree,
  Scene,
} from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import { type Editor, Extension, type JSONContent, mergeAttributes, Node } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  History,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, streamGeneration } from "../api.js";
import {
  AsterismDecorations,
  setCandidateDecoration,
  setMentionDecorations,
} from "../editor/AsterismDecorations.js";
import { generatedProseContent } from "../editor/generatedProse.js";
import { ErrorNotice } from "./AppShell.js";
import { type GenerationOptions, EditorActionsContext } from "./editor/EditorActionsContext.js";
import { SceneBeat } from "./editor/sceneBeat.js";
export type ManuscriptScope =
  | { kind: "scene"; id: string }
  | { kind: "story" }
  | { kind: "act"; id: string }
  | { kind: "chapter"; id: string };

type ActiveGeneration = {
  id: string | null;
  sceneId: string;
  position: number;
  text: string;
  status: "streaming" | "complete" | "failed";
  options: GenerationOptions;
  contextFallback: boolean;
};

type SceneRevision = { id: string; version: number; reason: string; createdAt: string };

const CompositeDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});
const ManuscriptHeadingView = (props: NodeViewProps) => {
  const isAct = props.node.attrs.level === "act";
  const label = `${isAct ? "Act" : "Chapter"} ${Number(props.node.attrs.position) + 1}`;
  const queryClient = useQueryClient();

  const [localTitle, setLocalTitle] = useState(props.node.attrs.title);

  useEffect(() => {
    setLocalTitle(props.node.attrs.title);
  }, [props.node.attrs.title]);

  const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    const newTitle = e.currentTarget.textContent?.trim() || "";
    e.currentTarget.textContent = newTitle; // format text cleanly on blur
    if (newTitle !== props.node.attrs.title) {
      props.updateAttributes({ title: newTitle });
      void api(`/${isAct ? "api/acts" : "api/chapters"}/${props.node.attrs.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle }),
      }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["project-tree"] });
      });
    }
  };

  return (
    <NodeViewWrapper 
      as={isAct ? "h2" : "h3"} 
      className={`manuscript-structure-heading ${props.node.attrs.level}`}
      onClick={(e: React.MouseEvent) => {
        const input = e.currentTarget.querySelector('.title-input') as HTMLElement;
        if (input && document.activeElement !== input) {
          input.focus();
        }
      }}
    >
      <span>{label}{localTitle ? ": " : ""}</span>
      <span
        className="title-input"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => setLocalTitle(e.currentTarget.textContent || "")}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      >
        {props.node.attrs.title}
      </span>
    </NodeViewWrapper>
  );
};

const ManuscriptHeading = Node.create({
  name: "manuscriptHeading",
  group: "block",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      id: { default: "" },
      level: { default: "chapter" },
      title: { default: "" },
      position: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: "*[data-manuscript-heading]" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ManuscriptHeadingView);
  },
  renderHTML({ node, HTMLAttributes }) {
    const isAct = node.attrs.level === "act";
    const label = `${isAct ? "Act" : "Chapter"} ${Number(node.attrs.position) + 1}`;
    const text = node.attrs.title ? `${label}: ${node.attrs.title}` : label;
    return [
      isAct ? "h2" : "h3",
      mergeAttributes(HTMLAttributes, {
        "data-manuscript-heading": node.attrs.level,
        class: `manuscript-structure-heading ${node.attrs.level}`,
        contenteditable: "false",
      }),
      text,
    ];
  },
});

const SceneBlock = Node.create({
  name: "sceneBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      sceneId: { default: "" },
      title: { default: "" },
      version: { default: 1 },
      position: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-scene-id]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-scene-id": node.attrs.sceneId,
        class: "continuous-scene-block",
      }),
      [
        "div",
        { class: "nc-scene-divider", contenteditable: "false", title: node.attrs.title },
        "— ⟡ —"
      ],
      ["div", { class: "continuous-scene-content" }, 0],
    ];
  },
});

function sceneIdAt(editor: Editor, position: number): string | null {
  return sceneIdAtDocument(editor.state.doc, position);
}

function sceneIdAtDocument(document: ProseMirrorNode, position: number): string | null {
  const resolved = document.resolve(Math.max(0, Math.min(position, document.content.size)));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name === "sceneBlock") return String(node.attrs.sceneId);
  }
  return null;
}

function sceneNode(editor: Editor, sceneId: string): { node: ProseMirrorNode; pos: number } | null {
  const result: { value: { node: ProseMirrorNode; pos: number } | null } = { value: null };
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "sceneBlock" && node.attrs.sceneId === sceneId) {
      result.value = { node, pos };
      return false;
    }
    return undefined;
  });
  return result.value;
}

function structureSignature(editorDocument: ProseMirrorNode): string[] {
  const signature: string[] = [];
  editorDocument.forEach((node) => {
    signature.push(
      node.type.name === "sceneBlock"
        ? `scene:${String(node.attrs.sceneId)}`
        : `heading:${String(node.attrs.level)}:${String(node.attrs.title)}`,
    );
  });
  return signature;
}

const LockedSceneBoundaries = Extension.create({
  name: "lockedSceneBoundaries",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(transaction, state) {
          const selection = transaction.selection;
          if (!selection.empty) {
            const fromId = (() => {
              const resolved = transaction.doc.resolve(selection.from);
              for (let depth = resolved.depth; depth > 0; depth -= 1) {
                if (resolved.node(depth).type.name === "sceneBlock")
                  return resolved.node(depth).attrs.sceneId;
              }
              return null;
            })();
            const toId = (() => {
              const resolved = transaction.doc.resolve(selection.to);
              for (let depth = resolved.depth; depth > 0; depth -= 1) {
                if (resolved.node(depth).type.name === "sceneBlock")
                  return resolved.node(depth).attrs.sceneId;
              }
              return null;
            })();
            if (fromId !== toId) return false;
          }
          if (transaction.docChanged) {
            const before = structureSignature(state.doc);
            const after = structureSignature(transaction.doc);
            if (before.join("|") !== after.join("|")) return false;
          }
          return true;
        },
      }),
    ];
  },
});

function scenesForScope(tree: ManuscriptTree, scope: ManuscriptScope): Scene[] {
  if (scope.kind === "scene") {
    return tree.acts
      .flatMap((act) => act.chapters.flatMap((chapter) => chapter.scenes))
      .filter((scene) => scene.id === scope.id);
  }
  return tree.acts
    .filter((act) => scope.kind !== "act" || act.id === scope.id)
    .flatMap((act) =>
      act.chapters
        .filter((chapter) => scope.kind !== "chapter" || chapter.id === scope.id)
        .flatMap((chapter) => chapter.scenes),
    );
}

export function compositeDocument(tree: ManuscriptTree, scope: ManuscriptScope): JSONContent {
  if (scope.kind === "scene") {
    const scene = scenesForScope(tree, scope)[0];
    return {
      type: "doc",
      content: scene
        ? [
            {
              type: "sceneBlock",
              attrs: {
                sceneId: scene.id,
                title: scene.title,
                version: scene.version,
                position: scene.position,
              },
              content: scene.document.content?.length
                ? (scene.document.content as JSONContent[])
                : [{ type: "paragraph" }],
            },
          ]
        : [],
    };
  }
  const content: JSONContent[] = [];
  for (const act of tree.acts.filter((item) => scope.kind !== "act" || item.id === scope.id)) {
    if (scope.kind !== "chapter") {
      content.push({
        type: "manuscriptHeading",
        attrs: { id: act.id, level: "act", title: act.title, position: act.position },
      });
    }
    for (const chapter of act.chapters.filter(
      (item) => scope.kind !== "chapter" || item.id === scope.id,
    )) {
      content.push({
        type: "manuscriptHeading",
        attrs: { id: chapter.id, level: "chapter", title: chapter.title, position: chapter.position },
      });
      for (const scene of chapter.scenes) {
        content.push({
          type: "sceneBlock",
          attrs: {
            sceneId: scene.id,
            title: scene.title,
            version: scene.version,
            position: scene.position,
          },
          content: scene.document.content?.length
            ? (scene.document.content as JSONContent[])
            : [{ type: "paragraph" }],
        });
      }
    }
  }
  return { type: "doc", content };
}

function extractScene(editor: Editor, sceneId: string) {
  const found = sceneNode(editor, sceneId);
  if (!found) return null;
  return {
    document: { type: "doc", content: found.node.content.toJSON() } as JSONContent,
    plainText: found.node.textBetween(0, found.node.content.size, "\n\n"),
    blockPosition: found.pos,
    contentStart: found.pos + 1,
    contentEnd: found.pos + found.node.nodeSize - 1,
  };
}

function refreshMentionDecorations(editor: Editor, entries: CompendiumEntry[]) {
  const mentions: Array<{ from: number; to: number; entryIds: string[] }> = [];
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
}

export type ManuscriptEditorHandle = { flush: () => Promise<void> };

export const ManuscriptEditor = forwardRef<
  ManuscriptEditorHandle,
  {
    tree: ManuscriptTree;
    scope: ManuscriptScope;
    entries: CompendiumEntry[];
    baseModel: string;
    models: Array<{ id: string; name: string }>;
    onSaved: (scene: Scene) => void;
    onOpenEntry: (entryIds: string[], direct: boolean) => void;
    onSelectScene: (sceneId: string) => void;
  }
>(function ManuscriptEditor(
  { tree, scope, entries, baseModel, models, onSaved, onOpenEntry, onSelectScene },
  ref,
) {
  const visibleScenes = useMemo(() => scenesForScope(tree, scope), [tree, scope]);
  const scopeKey = `${scope.kind}:${"id" in scope ? scope.id : "all"}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<ActiveGeneration | null>(null);
  const [activeSceneId, setActiveSceneId] = useState(visibleScenes[0]?.id ?? "");
  const [error, setError] = useState<unknown>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(() => new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<SceneRevision[]>([]);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRefs = useRef(new Map(visibleScenes.map((scene) => [scene.id, scene.version])));
  const documentRefs = useRef(
    new Map(visibleScenes.map((scene) => [scene.id, JSON.stringify(scene.document)])),
  );
  const onSavedRef = useRef(onSaved);
  const conflictsRef = useRef(conflicts);
  const activeRef = useRef(active);
  const entriesRef = useRef(entries);
  const cursorRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);

  const saveScene = useCallback(async (editor: Editor, sceneId: string) => {
    const extracted = extractScene(editor, sceneId);
    if (!extracted || conflictsRef.current.has(sceneId)) return null;
    if (documentRefs.current.get(sceneId) === JSON.stringify(extracted.document)) return null;
    const existingTimer = saveTimers.current.get(sceneId);
    if (existingTimer) clearTimeout(existingTimer);
    saveTimers.current.delete(sceneId);
    try {
      const updated = await api<Scene>(`/api/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: versionRefs.current.get(sceneId),
          document: extracted.document,
          plainText: extracted.plainText,
          revisionReason: "autosave",
        }),
      });
      versionRefs.current.set(sceneId, updated.version);
      documentRefs.current.set(sceneId, JSON.stringify(updated.document));
      onSavedRef.current(updated);
      return updated;
    } catch (saveError) {
      setError(saveError);
      setConflicts((current) => new Set(current).add(sceneId));
      return null;
    }
  }, []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          document: false,
          heading: false,
          codeBlock: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
        }),
        CompositeDocument,
        ManuscriptHeading,
        SceneBlock,
        SceneBeat,
        LockedSceneBoundaries,
        Placeholder.configure({ placeholder: "Begin the scene… Press / for Asterism." }),
        AsterismDecorations,
      ],
      content: compositeDocument(tree, scope),
      editorProps: {
        attributes: { class: "manuscript-prose continuous-editor-prose", spellcheck: "true" },
        handleKeyDown(view, event) {
          if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            view.dispatch(view.state.tr.deleteSelection());
            const latestModel = localStorage.getItem("asterism-latest-model");
            const attrs = latestModel ? { modelOverride: latestModel } : {};
            editor?.chain().focus().insertContent({ type: "sceneBeat", attrs }).run();
            return true;
          }
          return false;
        },
        handleClick(_view, _position, event) {
          const target = event.target as HTMLElement;
          const sceneElement = target.closest<HTMLElement>("[data-scene-id]");
          if (sceneElement?.dataset.sceneId) setActiveSceneId(sceneElement.dataset.sceneId);
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
        const sceneId = sceneIdAt(current, cursorRef.current);
        if (sceneId) setActiveSceneId(sceneId);
      },
      onUpdate({ editor: current, transaction }) {
        if (transaction.getMeta("remote-scene") || activeRef.current) return;
        const sceneId = sceneIdAt(current, current.state.selection.from);
        if (!sceneId || conflictsRef.current.has(sceneId)) return;
        const extracted = extractScene(current, sceneId);
        if (extracted && documentRefs.current.get(sceneId) === JSON.stringify(extracted.document))
          return;
        if (mentionTimer.current) clearTimeout(mentionTimer.current);
        mentionTimer.current = setTimeout(
          () => refreshMentionDecorations(current, entriesRef.current),
          100,
        );
        const previous = saveTimers.current.get(sceneId);
        if (previous) clearTimeout(previous);
        saveTimers.current.set(
          sceneId,
          setTimeout(() => void saveScene(current, sceneId), 900),
        );
      },
    },
    [scopeKey],
  );

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    conflictsRef.current = conflicts;
  }, [conflicts]);
  useEffect(() => {
    entriesRef.current = entries;
    if (!editor) return;
    refreshMentionDecorations(editor, entries);
  }, [editor, entries]);
  useEffect(() => {
    if (!editor) return;
    setCandidateDecoration(
      editor,
      active ? { position: active.position, text: active.text } : null,
    );
    editor.setEditable(!active);
  }, [active, editor]);
  useEffect(
    () => () => {
      for (const timer of saveTimers.current.values()) clearTimeout(timer);
      if (mentionTimer.current) clearTimeout(mentionTimer.current);
      if (editor) {
        for (const sceneId of saveTimers.current.keys()) void saveScene(editor, sceneId);
      }
    },
    [editor, saveScene],
  );
  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        if (!editor) return;
        await Promise.all(
          [...saveTimers.current.keys()].map((sceneId) => saveScene(editor, sceneId)),
        );
      },
    }),
    [editor, saveScene],
  );

  const startGeneration = useCallback(
    async (options: GenerationOptions, positionOverride?: number) => {
      if (!editor) return;
      const position = positionOverride ?? cursorRef.current;
      const sceneId = sceneIdAt(editor, position);
      if (!sceneId) return;
      await saveScene(editor, sceneId);
      const extracted = extractScene(editor, sceneId);
      const scene = visibleScenes.find((candidate) => candidate.id === sceneId);
      if (!extracted || !scene) return;
      const localPosition = Math.max(1, position - extracted.contentStart + 1);
      setMenuOpen(false);
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      setActive({
        id: null,
        sceneId,
        position,
        text: "",
        status: "streaming",
        options,
        contextFallback: false,
      });
      const request: GenerationRequest = {
        sceneId,
        sceneVersion: versionRefs.current.get(sceneId) ?? scene.version,
        workflow: options.workflow,
        cursorPosition: localPosition,
        manuscriptBeforeCursor: editor.state.doc.textBetween(
          extracted.contentStart,
          position,
          "\n\n",
        ),
        manuscriptAfterCursor: editor.state.doc.textBetween(position, extracted.contentEnd, "\n\n"),
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
    [editor, saveScene, visibleScenes],
  );

  const accept = async () => {
    if (!editor || !active?.id) return;
    const original = editor.getJSON();
    editor.commands.insertContentAt(active.position, generatedProseContent(active.text));
    const extracted = extractScene(editor, active.sceneId);
    if (!extracted) return;
    try {
      const updated = await api<Scene>(`/api/generations/${active.id}/accept`, {
        method: "POST",
        body: JSON.stringify({
          expectedSceneVersion: versionRefs.current.get(active.sceneId),
          document: extracted.document,
          plainText: extracted.plainText,
        }),
      });
      versionRefs.current.set(updated.id, updated.version);
      documentRefs.current.set(updated.id, JSON.stringify(updated.document));
      onSaved(updated);
      setActive(null);
    } catch (acceptError) {
      editor.commands.setContent(original);
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
    if (!activeSceneId) return;
    try {
      setRevisions(await api<SceneRevision[]>(`/api/scenes/${activeSceneId}/revisions`));
      setHistoryOpen(true);
    } catch (historyError) {
      setError(historyError);
    }
  };

  const allScenes = tree.acts.flatMap((act) => act.chapters.flatMap((chapter) => chapter.scenes));
  const selectedIndex = allScenes.findIndex((scene) => scene.id === activeSceneId);
  const activeScene = allScenes[selectedIndex];
  const previousScene = selectedIndex > 0 ? allScenes[selectedIndex - 1] : undefined;
  const nextScene = selectedIndex >= 0 ? allScenes[selectedIndex + 1] : undefined;

  return (
    <div className="editor-column continuous-editor-column">
      <div className="editor-header manuscript-scope-header">
        <div>
          <p className="eyebrow">{scope.kind === "scene" ? "Scene" : "Continuous manuscript"}</p>
          <h2>
            {scope.kind === "story" ? tree.project.title : (activeScene?.title ?? "Manuscript")}
          </h2>
        </div>
        <div className="editor-header-actions">
          <button
            type="button"
            className="icon-button"
            disabled={selectedIndex <= 0}
            onClick={() => previousScene && onSelectScene(previousScene.id)}
            aria-label="Previous Scene"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={selectedIndex < 0 || selectedIndex >= allScenes.length - 1}
            onClick={() => nextScene && onSelectScene(nextScene.id)}
            aria-label="Next Scene"
          >
            <ChevronRight size={16} />
          </button>
          <button type="button" className="button ghost" onClick={loadHistory}>
            <History size={14} /> History
          </button>
        </div>
      </div>
      <div className="editor-body">
        <div className="editor-frame continuous-editor-frame">
          <div className="editor-toolbar">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>
              B
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>
              <em>I</em>
            </button>
            <span />
            <button
              type="button"
              className="ai-command"
              onClick={() => {
                const latestModel = localStorage.getItem("asterism-latest-model");
                const attrs = latestModel ? { modelOverride: latestModel } : {};
                editor?.chain().focus().insertContent({ type: "sceneBeat", attrs }).run();
              }}
            >
              <Sparkles size={15} /> AI /
            </button>
          </div>
          <EditorActionsContext.Provider value={{ baseModel, models, startGeneration }}>
            <EditorContent editor={editor} />
          </EditorActionsContext.Provider>
        </div>
        <nav className="editor-side-nav">
          {tree.acts.map((act) => {
            const actScenes = visibleScenes.filter((s) =>
              act.chapters.some((c) => c.scenes.some((cs) => cs.id === s.id)),
            );
            if (actScenes.length === 0) return null;
            return (
              <div key={act.id} className="nav-act">
                <span className="nav-act-title">Act {act.position + 1}{act.title ? `: ${act.title}` : ""}</span>
                {act.chapters.map((chapter) => {
                  const chapterScenes = visibleScenes.filter((s) =>
                    chapter.scenes.some((cs) => cs.id === s.id),
                  );
                  if (chapterScenes.length === 0) return null;
                  return (
                    <div key={chapter.id} className="nav-chapter">
                      <span className="nav-chapter-title">Chapter {chapter.position + 1}{chapter.title ? `: ${chapter.title}` : ""}</span>
                      {chapter.scenes.map((scene) => {
                        if (!visibleScenes.some((s) => s.id === scene.id)) return null;
                        return (
                          <button
                            key={scene.id}
                            type="button"
                            className={`nav-scene ${scene.id === activeSceneId ? "active" : ""}`}
                            onClick={() => {
                              onSelectScene(scene.id);
                              const el = document.querySelector(`[data-scene-id="${scene.id}"]`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                            }}
                          >
                            {scene.title}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>
      {conflicts.size ? (
        <div className="scene-conflict-banner">
          <span>A Scene changed elsewhere. Local prose has been preserved.</span>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              const sceneId = [...conflicts][0];
              const extracted = editor && sceneId ? extractScene(editor, sceneId) : null;
              if (extracted) void navigator.clipboard.writeText(extracted.plainText);
            }}
          >
            <Clipboard size={13} /> Copy local text
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              const sceneId = [...conflicts][0];
              if (!editor || !sceneId) return;
              const remote = await api<Scene>(`/api/scenes/${sceneId}`);
              versionRefs.current.set(sceneId, remote.version);
              documentRefs.current.set(sceneId, JSON.stringify(remote.document));
              onSaved(remote);
              editor.commands.setContent(compositeDocument(updateTreeScene(tree, remote), scope));
              setConflicts((current) => {
                const next = new Set(current);
                next.delete(sceneId);
                return next;
              });
            }}
          >
            <RotateCcw size={13} /> Reload server version
          </button>
        </div>
      ) : null}
      {active ? (
        <div className="candidate-controls">
          <span>
            {active.status === "streaming" ? (
              <>
                <RefreshCw className="spin" size={15} /> Asterism is writing…
              </>
            ) : active.status === "complete" ? (
              "Candidate ready"
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
              {revisions.map((revision) => (
                <div key={revision.id}>
                  <span>
                    Version {revision.version} · {revision.reason}
                  </span>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={async () => {
                      const restored = await api<Scene>(
                        `/api/scenes/${activeSceneId}/revisions/${revision.id}/restore`,
                        { method: "POST" },
                      );
                      versionRefs.current.set(restored.id, restored.version);
                      documentRefs.current.set(restored.id, JSON.stringify(restored.document));
                      onSaved(restored);
                      editor?.commands.setContent(
                        compositeDocument(updateTreeScene(tree, restored), scope),
                      );
                      setHistoryOpen(false);
                    }}
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
});

function updateTreeScene(tree: ManuscriptTree, updated: Scene): ManuscriptTree {
  return {
    ...tree,
    acts: tree.acts.map((act) => ({
      ...act,
      chapters: act.chapters.map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.map((scene) => (scene.id === updated.id ? updated : scene)),
      })),
    })),
  };
}
