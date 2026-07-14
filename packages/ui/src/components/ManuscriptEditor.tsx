import type {
  CompendiumEntry,
  CreateManuscriptItemInput,
  EditorSettings,
  GenerationRequest,
  GenerationStreamEvent,
  ManuscriptTree,
  Scene,
  SelectionAction,
} from "@asterism/contracts";
import { findMentions, manuscriptLabels } from "@asterism/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Editor,
  Extension,
  type JSONContent,
  markInputRule,
  markPasteRule,
  mergeAttributes,
  Node,
} from "@tiptap/core";
import Italic from "@tiptap/extension-italic";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import {
  EditorContent,
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  History,
  ListTree,
  MoreHorizontal,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React, {
  type CSSProperties,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { asterism, streamGeneration } from "../api.js";
import {
  AsterismDecorations,
  setCandidateDecoration,
  setMentionDecorations,
} from "../editor/AsterismDecorations.js";
import { generatedProseContent } from "../editor/generatedProse.js";
import {
  compositeDocument,
  type ManuscriptScope,
  scenesForScope,
  selectionReplacementContent,
} from "../editor/manuscriptDocument.js";
import { trapFocusWithin } from "../utils/focus.js";
import { candidateControlsLayout, updateSceneInTree } from "../utils/manuscript.js";
import { ErrorNotice } from "./AppShell.js";
import {
  EditorActionsContext,
  type GenerationOptions,
  type InsertionGenerationOptions,
} from "./editor/EditorActionsContext.js";
import { SceneBeat } from "./editor/sceneBeat.js";
import { ModelSelect } from "./ModelSelect.js";

type ActiveGeneration = {
  id: string | null;
  sceneId: string;
  position: number;
  text: string;
  status: "streaming" | "complete" | "failed";
  options: GenerationOptions;
  selection: { from: number; to: number } | null;
  contextFallback: boolean;
  previousText: string | null;
  continuation: number;
};

type SelectionMenu = {
  from: number;
  to: number;
  sceneId: string;
  text: string;
  top: number;
  left: number;
};

type SelectionPanel = SelectionMenu & {
  action: SelectionAction;
  instructions: string;
  modelOverride: string | null;
};

const editorSettingsDefaults: EditorSettings = {
  fontFamily: "literary",
  fontSize: 18,
  lineHeight: 1.85,
  paragraphSpacing: 1.15,
  firstLineIndent: 0,
  pageWidth: 920,
  textAlign: "left",
};

const editorFontStacks: Record<EditorSettings["fontFamily"], string> = {
  literary: "var(--serif)",
  classic: 'Georgia, "Times New Roman", serif',
  sans: "var(--sans)",
};

const selectionActions: Array<{ action: SelectionAction; label: string }> = [
  { action: "expand", label: "Expand" },
  { action: "rephrase", label: "Rephrase" },
  { action: "shorten", label: "Shorten" },
  { action: "polish", label: "Polish" },
  { action: "custom", label: "Custom" },
];

const StructureActionsContext = createContext<{
  create: (input: CreateManuscriptItemInput) => Promise<void>;
} | null>(null);

function useStructureActions() {
  const value = useContext(StructureActionsContext);
  if (!value) throw new Error("Structure actions require a provider.");
  return value;
}

type SceneRevision = { id: string; version: number; reason: string; createdAt: string };

const CustomItalic = Italic.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)((?:\*)((?:[^*]+))(?:\*))$/,
        type: this.type,
      }),
    ];
  },
  addPasteRules() {
    return [
      markPasteRule({
        find: /(?:^|\s)((?:\*)((?:[^*]+))(?:\*))/g,
        type: this.type,
      }),
    ];
  },
});

const CustomUnderline = Underline.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)((?:_)((?:[^_]+))(?:_))$/,
        type: this.type,
      }),
    ];
  },
  addPasteRules() {
    return [
      markPasteRule({
        find: /(?:^|\s)((?:_)((?:[^_]+))(?:_))/g,
        type: this.type,
      }),
    ];
  },
});

const CompositeDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});
const ManuscriptHeadingView = (props: NodeViewProps) => {
  const isAct = props.node.attrs.level === "act";
  const label = `${isAct ? "Act" : "Chapter"} ${Number(props.node.attrs.ordinal)}`;
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
      void asterism()
        .manuscript.updateItem(isAct ? "act" : "chapter", props.node.attrs.id, {
          title: newTitle,
        })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["project-tree"] });
        });
    }
  };

  return (
    <NodeViewWrapper as="div" className="manuscript-heading-wrapper">
      {React.createElement(
        isAct ? "h2" : "h3",
        {
          className: `manuscript-structure-heading ${props.node.attrs.level}`,
          onClick: (e: React.MouseEvent) => {
            const input = e.currentTarget.querySelector(".title-input") as HTMLElement;
            if (input && document.activeElement !== input) input.focus();
          },
        },
        <>
          <span>
            {label}
            {localTitle ? ": " : ""}
          </span>
          {/* biome-ignore lint/a11y/useSemanticElements: Tiptap requires a contenteditable inline node here. */}
          <span
            className="title-input"
            role="textbox"
            aria-label={`${label} title`}
            tabIndex={0}
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
        </>,
      )}
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
      ordinal: { default: 1 },
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
    const label = `${isAct ? "Act" : "Chapter"} ${Number(node.attrs.ordinal)}`;
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

const SceneBlockView = (props: NodeViewProps) => {
  const { create } = useStructureActions();

  return (
    <NodeViewWrapper
      as="section"
      className="continuous-scene-block"
      data-scene-id={props.node.attrs.sceneId}
    >
      <div className="nc-scene-divider" contentEditable={false}>
        <span>{props.node.attrs.displayLabel}</span>
      </div>
      <div className="continuous-scene-content">
        <NodeViewContent />
      </div>
      <div className="inline-append-controls" contentEditable={false}>
        <button
          type="button"
          className="inline-append-button"
          onClick={() =>
            void create({
              kind: "scene",
              chapterId: props.node.attrs.chapterId,
              afterSceneId: props.node.attrs.sceneId,
            })
          }
          title="New Scene"
        >
          <Plus size={14} /> New Scene
        </button>
        {props.node.attrs.isLastInChapter ? (
          <button
            type="button"
            className="inline-append-button"
            onClick={() =>
              void create({
                kind: "chapter",
                actId: props.node.attrs.actId,
                afterChapterId: props.node.attrs.chapterId,
              })
            }
          >
            <Plus size={14} /> New Chapter
          </button>
        ) : null}
        {props.node.attrs.isLastInAct ? (
          <button
            type="button"
            className="inline-append-button"
            onClick={() => void create({ kind: "act", afterActId: props.node.attrs.actId })}
          >
            <Plus size={14} /> New Act
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
};

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
      displayLabel: { default: "Scene 1" },
      actId: { default: "" },
      chapterId: { default: "" },
      isLastInChapter: { default: false },
      isLastInAct: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-scene-id]" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SceneBlockView);
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
        { class: "nc-scene-divider", contenteditable: "false" },
        ["span", {}, node.attrs.displayLabel],
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
export type FirstSceneGenerationIntent = {
  id: string;
  sceneId: string;
  options: InsertionGenerationOptions & { workflow: "prose.first_scene" };
};

export const ManuscriptEditor = forwardRef<
  ManuscriptEditorHandle,
  {
    aiConfigured: boolean;
    tree: ManuscriptTree;
    scope: ManuscriptScope;
    entries: CompendiumEntry[];
    baseModel: string;
    headerActionsTarget?: HTMLElement | null;
    models: Array<{ id: string; name: string }>;
    onSaved: (scene: Scene) => void;
    onOpenEntry: (entryIds: string[], direct: boolean) => void;
    onSelectScope: (scope: ManuscriptScope) => void;
    onSelectScene: (sceneId: string) => void;
    firstSceneGenerationIntent?: FirstSceneGenerationIntent | null;
    onFirstSceneGenerationIntentConsumed?: () => void;
  }
>(function ManuscriptEditor(
  {
    aiConfigured,
    tree,
    scope,
    entries,
    baseModel,
    headerActionsTarget = null,
    models,
    onSaved,
    onOpenEntry,
    onSelectScope,
    onSelectScene,
    firstSceneGenerationIntent = null,
    onFirstSceneGenerationIntentConsumed,
  },
  ref,
) {
  const queryClient = useQueryClient();
  const visibleScenes = useMemo(() => scenesForScope(tree, scope), [tree, scope]);
  const scopeKey = `${scope.kind}:${"id" in scope ? scope.id : "all"}`;
  const [typographyOpen, setTypographyOpen] = useState(false);
  const [typographyMenuPosition, setTypographyMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mobileNavigatorOpen, setMobileNavigatorOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(editorSettingsDefaults);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const [selectionPanel, setSelectionPanel] = useState<SelectionPanel | null>(null);
  const [active, setActive] = useState<ActiveGeneration | null>(null);
  const hasActiveGeneration = active !== null;
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
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorColumnRef = useRef<HTMLDivElement>(null);
  const candidateControlsRef = useRef<HTMLDivElement>(null);
  const typographyAnchorRef = useRef<HTMLButtonElement>(null);
  const mobileNavigatorCloseRef = useRef<HTMLButtonElement>(null);
  const mobileToolsCloseRef = useRef<HTMLButtonElement>(null);
  const consumedFirstSceneIntentRef = useRef<string | null>(null);
  const settingsQuery = useQuery({
    queryKey: ["editor-settings"],
    queryFn: () => asterism().settings.editor(),
  });
  const settingsMutation = useMutation({
    mutationFn: (value: EditorSettings) => asterism().settings.updateEditor(value),
    onSuccess: (value) => {
      queryClient.setQueryData(["editor-settings"], value);
    },
  });

  const positionTypographyMenu = useCallback((anchor = typographyAnchorRef.current) => {
    if (!anchor || window.matchMedia("(max-width: 700px)").matches) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    setTypographyMenuPosition({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
    });
  }, []);

  const toggleTypographyMenu = (anchor: HTMLButtonElement) => {
    typographyAnchorRef.current = anchor;
    if (typographyOpen) {
      setTypographyOpen(false);
      return;
    }
    positionTypographyMenu(anchor);
    setTypographyOpen(true);
  };

  const saveScene = useCallback(async (editor: Editor, sceneId: string) => {
    const extracted = extractScene(editor, sceneId);
    if (!extracted || conflictsRef.current.has(sceneId)) return null;
    if (documentRefs.current.get(sceneId) === JSON.stringify(extracted.document)) return null;
    const existingTimer = saveTimers.current.get(sceneId);
    if (existingTimer) clearTimeout(existingTimer);
    saveTimers.current.delete(sceneId);
    try {
      const updated = await asterism().manuscript.updateScene(sceneId, {
        expectedVersion: versionRefs.current.get(sceneId),
        document: extracted.document,
        plainText: extracted.plainText,
        revisionReason: "autosave",
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
          heading: { levels: [1, 2, 3] },
          codeBlock: false,
          italic: false,
          underline: false,
        }),
        CustomItalic,
        CustomUnderline,
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
        handleTextInput(view, _from, _to, text) {
          if (text !== "/") return false;
          const sceneBeat = view.state.schema.nodes.sceneBeat;
          if (!sceneBeat) return false;
          const latestModel = localStorage.getItem("asterism-latest-model");
          const attrs = latestModel ? { modelOverride: latestModel } : {};
          view.dispatch(view.state.tr.replaceSelectionWith(sceneBeat.create(attrs)));
          return true;
        },
        handleKeyDown(view, event) {
          if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            const sceneBeat = view.state.schema.nodes.sceneBeat;
            if (!sceneBeat) return false;
            const latestModel = localStorage.getItem("asterism-latest-model");
            const attrs = latestModel ? { modelOverride: latestModel } : {};
            view.dispatch(view.state.tr.replaceSelectionWith(sceneBeat.create(attrs)));
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
        const { from, to, empty } = current.state.selection;
        const toSceneId = empty ? null : sceneIdAt(current, Math.max(from, to - 1));
        if (empty || !sceneId || sceneId !== toSceneId || activeRef.current) {
          setSelectionMenu(null);
          return;
        }
        const text = current.state.doc.textBetween(from, to, "\n\n").trim();
        if (!text) {
          setSelectionMenu(null);
          return;
        }
        const start = current.view.coordsAtPos(from);
        const end = current.view.coordsAtPos(to);
        const horizontalMargin = Math.min(290, window.innerWidth / 2);
        setSelectionMenu({
          from,
          to,
          sceneId,
          text,
          top: Math.max(12, Math.min(start.top, end.top) - 92),
          left: Math.max(
            horizontalMargin,
            Math.min((start.left + end.right) / 2, window.innerWidth - horizontalMargin),
          ),
        });
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
    if (settingsQuery.data) setEditorSettings(settingsQuery.data);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (mobileNavigatorOpen) requestAnimationFrame(() => mobileNavigatorCloseRef.current?.focus());
  }, [mobileNavigatorOpen]);
  useEffect(() => {
    if (mobileToolsOpen) requestAnimationFrame(() => mobileToolsCloseRef.current?.focus());
  }, [mobileToolsOpen]);
  useEffect(() => {
    if (!typographyOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!(event.target as Element).closest(".typography-control, .typography-menu"))
        setTypographyOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [typographyOpen]);
  useEffect(() => {
    if (!typographyOpen || window.matchMedia("(max-width: 700px)").matches) return;
    const reposition = () => positionTypographyMenu();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [positionTypographyMenu, typographyOpen]);
  useEffect(() => {
    const closeOverlays = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || activeRef.current) return;
      setTypographyOpen(false);
      setMobileNavigatorOpen(false);
      setMobileToolsOpen(false);
      setSelectionMenu(null);
      setSelectionPanel(null);
    };
    document.addEventListener("keydown", closeOverlays);
    return () => document.removeEventListener("keydown", closeOverlays);
  }, []);
  useEffect(() => {
    if (!editor) return;
    setCandidateDecoration(
      editor,
      active
        ? active.selection
          ? {
              kind: "replacement",
              from: active.selection.from,
              to: active.selection.to,
              text: active.text,
            }
          : { kind: "insertion", position: active.position, text: active.text }
        : null,
    );
    editor.setEditable(!active);
  }, [active, editor]);
  useEffect(() => {
    if (!hasActiveGeneration) return;
    const frame = editorColumnRef.current;
    const controls = candidateControlsRef.current;
    if (!frame || !controls) return;
    const syncControlsLayout = () => {
      const layout = candidateControlsLayout(frame.getBoundingClientRect());
      controls.style.setProperty("--candidate-controls-center-x", `${layout.centerX}px`);
      controls.style.setProperty("--candidate-controls-editor-width", `${layout.editorWidth}px`);
    };
    syncControlsLayout();
    const resizeObserver = new ResizeObserver(syncControlsLayout);
    resizeObserver.observe(frame);
    window.addEventListener("resize", syncControlsLayout);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncControlsLayout);
    };
  }, [hasActiveGeneration]);
  useEffect(() => {
    if (!active || !editor) return;
    const frame = editorColumnRef.current;
    const controls = candidateControlsRef.current;
    if (!frame || !controls) return;
    const animationFrame = requestAnimationFrame(() => {
      const candidate = editor.view.dom.querySelector<HTMLElement>(
        '[data-testid="temporary-generation"]',
      );
      if (!candidate) return;
      const candidateBottom = candidate.getBoundingClientRect().bottom;
      const unobscuredBottom = controls.getBoundingClientRect().top - 20;
      if (candidateBottom > unobscuredBottom) {
        frame.scrollBy({ top: candidateBottom - unobscuredBottom });
      }
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [active, editor]);
  useEffect(
    () => () => {
      for (const timer of saveTimers.current.values()) clearTimeout(timer);
      if (mentionTimer.current) clearTimeout(mentionTimer.current);
      if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
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
        if (settingsSaveTimer.current) {
          clearTimeout(settingsSaveTimer.current);
          settingsSaveTimer.current = null;
          await settingsMutation.mutateAsync(editorSettings);
        }
      },
    }),
    [editor, editorSettings, saveScene, settingsMutation],
  );

  const startGeneration = useCallback(
    async (
      options: GenerationOptions,
      positionOverride?: number,
      previousText: string | null = null,
    ) => {
      if (!aiConfigured) {
        setError(new Error("Configure an OpenRouter key in Settings before using AI."));
        return;
      }
      if (!editor) return;
      const position =
        positionOverride ??
        (options.workflow === "prose.revise_selection" ? options.selectionFrom : cursorRef.current);
      const selectionEnd =
        options.workflow === "prose.revise_selection" ? options.selectionTo : position;
      const sceneId = sceneIdAt(editor, position);
      if (!sceneId) return;
      await saveScene(editor, sceneId);
      const extracted = extractScene(editor, sceneId);
      const scene = visibleScenes.find((candidate) => candidate.id === sceneId);
      if (!extracted || !scene) return;
      const localPosition = Math.max(1, position - extracted.contentStart + 1);
      setSelectionMenu(null);
      setSelectionPanel(null);
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const nextActive: ActiveGeneration = {
        id: null,
        sceneId,
        position,
        text: previousText ?? "",
        status: "streaming",
        options,
        selection:
          options.workflow === "prose.revise_selection"
            ? { from: options.selectionFrom, to: options.selectionTo }
            : null,
        contextFallback: false,
        previousText,
        continuation: 0,
      };
      activeRef.current = nextActive;
      setActive(nextActive);
      const requestBase = {
        sceneId,
        sceneVersion: versionRefs.current.get(sceneId) ?? scene.version,
        cursorPosition: localPosition,
        manuscriptBeforeCursor: editor.state.doc.textBetween(
          extracted.contentStart,
          position,
          "\n\n",
        ),
        manuscriptAfterCursor: editor.state.doc.textBetween(
          selectionEnd,
          extracted.contentEnd,
          "\n\n",
        ),
        instructions: options.instructions,
        eventTarget: options.eventTarget,
        targetLength: options.targetLength,
        lengthUnit: options.lengthUnit,
        modelOverride: options.modelOverride,
        promptOverrideId: null,
      };
      const request: GenerationRequest =
        options.workflow === "prose.revise_selection"
          ? {
              ...requestBase,
              workflow: options.workflow,
              selectionAction: options.selectionAction,
              selectedText: options.selectedText,
            }
          : { ...requestBase, workflow: options.workflow };
      try {
        await streamGeneration(
          request,
          (event: GenerationStreamEvent) => {
            if (event.type === "generation.started") {
              setActive((value) => {
                const next = value ? { ...value, id: event.generationId } : value;
                activeRef.current = next;
                return next;
              });
            } else if (event.type === "generation.delta") {
              setActive((value) => {
                const next = value
                  ? {
                      ...value,
                      text: value.previousText === null ? value.text + event.delta : event.delta,
                      previousText: null,
                    }
                  : value;
                activeRef.current = next;
                return next;
              });
            } else if (event.type === "generation.continuing") {
              setActive((value) => {
                const next = value ? { ...value, continuation: event.continuation } : value;
                activeRef.current = next;
                return next;
              });
            } else if (event.type === "generation.completed") {
              setActive((value) => {
                const next = value
                  ? {
                      ...value,
                      text: event.candidateText,
                      status: "complete" as const,
                      contextFallback: event.contextFallback,
                      previousText: null,
                    }
                  : value;
                activeRef.current = next;
                return next;
              });
            } else if (event.type === "generation.failed") {
              setActive((value) => {
                const next = value ? { ...value, status: "failed" as const } : value;
                activeRef.current = next;
                return next;
              });
              setError(new Error(event.message));
            } else if (event.type === "generation.cancelled") {
              activeRef.current = null;
              setActive(null);
            }
          },
          controller.signal,
        );
      } catch (generationError) {
        if (!controller.signal.aborted) {
          setError(generationError);
        }
        const current = activeRef.current;
        if (current?.text.trim()) {
          const failed = { ...current, status: "failed" as const };
          activeRef.current = failed;
          setActive(failed);
        } else if (current?.status !== "complete") {
          activeRef.current = null;
          setActive(null);
        }
      }
    },
    [aiConfigured, editor, saveScene, visibleScenes],
  );

  useEffect(() => {
    if (
      !editor ||
      !firstSceneGenerationIntent ||
      activeRef.current ||
      consumedFirstSceneIntentRef.current === firstSceneGenerationIntent.id
    ) {
      return;
    }
    const found = sceneNode(editor, firstSceneGenerationIntent.sceneId);
    if (!found) return;
    consumedFirstSceneIntentRef.current = firstSceneGenerationIntent.id;
    onFirstSceneGenerationIntentConsumed?.();
    void startGeneration(firstSceneGenerationIntent.options, found.pos + 1);
  }, [editor, firstSceneGenerationIntent, onFirstSceneGenerationIntentConsumed, startGeneration]);

  const accept = async () => {
    if (!editor || !active?.id) return;
    const original = editor.getJSON();
    if (active.selection) {
      const from = editor.state.doc.resolve(active.selection.from);
      const to = editor.state.doc.resolve(active.selection.to);
      if (from.sameParent(to) && from.parent.isTextblock) {
        editor.commands.insertContentAt(
          active.selection,
          selectionReplacementContent(active.text, true),
        );
      } else {
        editor.commands.insertContentAt(
          active.selection,
          selectionReplacementContent(active.text, false),
        );
      }
    } else {
      editor.commands.insertContentAt(active.position, generatedProseContent(active.text));
    }
    const extracted = extractScene(editor, active.sceneId);
    if (!extracted) return;
    try {
      const updated = await asterism().generation.accept(active.id, {
        expectedSceneVersion: versionRefs.current.get(active.sceneId),
        document: extracted.document,
        plainText: extracted.plainText,
      });
      versionRefs.current.set(updated.id, updated.version);
      documentRefs.current.set(updated.id, JSON.stringify(updated.document));
      onSaved(updated);
      activeRef.current = null;
      setActive(null);
      setSelectionMenu(null);
      setSelectionPanel(null);
    } catch (acceptError) {
      editor.commands.setContent(original);
      setError(acceptError);
    }
  };
  const reject = async () => {
    if (active?.id) await asterism().generation.reject(active.id).catch(setError);
    activeRef.current = null;
    setActive(null);
    setSelectionMenu(null);
    setSelectionPanel(null);
  };
  const cancel = async () => {
    abortRef.current?.abort();
    if (active?.id)
      await asterism()
        .generation.cancel(active.id)
        .catch(() => undefined);
    activeRef.current = null;
    setActive(null);
    setSelectionMenu(null);
    setSelectionPanel(null);
  };
  const stop = async () => {
    if (!active) return;
    const currentActive: ActiveGeneration = { ...active, status: "complete" };
    activeRef.current = currentActive;
    setActive(currentActive);
    abortRef.current?.abort();
    if (active.id) {
      await asterism()
        .generation.cancel(active.id, { candidateText: active.text })
        .catch(() => undefined);
    }
  };
  const regenerate = async () => {
    if (!active) return;
    const { id, options, position, text } = active;
    const pending: ActiveGeneration = {
      ...active,
      id: null,
      status: "streaming",
      previousText: text,
    };
    activeRef.current = pending;
    setActive(pending);
    if (id) await asterism().generation.reject(id).catch(setError);
    await startGeneration(options, position, text);
  };
  const loadHistory = async () => {
    if (!activeSceneId) return;
    try {
      setRevisions(await asterism().manuscript.revisions(activeSceneId));
      setHistoryOpen(true);
    } catch (historyError) {
      setError(historyError);
    }
  };

  const allScenes = tree.acts.flatMap((act) => act.chapters.flatMap((chapter) => chapter.scenes));
  const structureLabels = useMemo(() => manuscriptLabels(tree), [tree]);
  const scopeDisplayLabel =
    scope.kind === "story"
      ? tree.project.title
      : scope.kind === "act"
        ? (structureLabels.acts.get(scope.id)?.label ?? "Act")
        : scope.kind === "chapter"
          ? (structureLabels.chapters.get(scope.id)?.label ?? "Chapter")
          : (structureLabels.scenes.get(scope.id)?.label ?? "Scene");
  const selectedIndex = allScenes.findIndex((scene) => scene.id === activeSceneId);
  const previousScene = selectedIndex > 0 ? allScenes[selectedIndex - 1] : undefined;
  const nextScene = selectedIndex >= 0 ? allScenes[selectedIndex + 1] : undefined;
  const selectedWordCount = selectionMenu?.text.split(/\s+/).length ?? 0;
  const editorStyle = {
    "--manuscript-font-family": editorFontStacks[editorSettings.fontFamily],
    "--manuscript-font-size": `${editorSettings.fontSize}px`,
    "--manuscript-line-height": String(editorSettings.lineHeight),
    "--manuscript-paragraph-spacing": `${editorSettings.paragraphSpacing}em`,
    "--manuscript-first-line-indent": `${editorSettings.firstLineIndent}em`,
    "--manuscript-page-width": `${editorSettings.pageWidth}px`,
    "--manuscript-text-align": editorSettings.textAlign,
  } as CSSProperties;
  const updateEditorSetting = <Key extends keyof EditorSettings>(
    key: Key,
    value: EditorSettings[Key],
  ) => {
    const next = { ...editorSettings, [key]: value };
    setEditorSettings(next);
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => settingsMutation.mutate(next), 350);
  };
  const generateSelectionRevision = () => {
    if (!selectionPanel) return;
    const wordCount = Math.max(1, selectionPanel.text.trim().split(/\s+/).length);
    const targetLength =
      selectionPanel.action === "expand"
        ? Math.ceil(wordCount * 1.5)
        : selectionPanel.action === "shorten"
          ? Math.max(1, Math.ceil(wordCount * 0.6))
          : selectionPanel.action === "custom"
            ? null
            : wordCount;
    void startGeneration({
      workflow: "prose.revise_selection",
      selectionAction: selectionPanel.action,
      selectedText: selectionPanel.text,
      selectionFrom: selectionPanel.from,
      selectionTo: selectionPanel.to,
      instructions: selectionPanel.instructions,
      eventTarget: "",
      targetLength,
      lengthUnit: "words",
      modelOverride: selectionPanel.modelOverride,
    });
  };
  const createStructure = useCallback(
    async (input: CreateManuscriptItemInput) => {
      try {
        if (editor) {
          await Promise.all(
            [...saveTimers.current.keys()].map((sceneId) => saveScene(editor, sceneId)),
          );
        }
        const created = await asterism().manuscript.createItem(tree.project.id, input);
        await queryClient.invalidateQueries({ queryKey: ["project-tree", tree.project.id] });
        onSelectScene(created.initialSceneId);
      } catch (creationError) {
        setError(creationError);
      }
    },
    [editor, onSelectScene, queryClient, saveScene, tree.project.id],
  );

  return (
    <div
      ref={editorColumnRef}
      className={`editor-column continuous-editor-column ${active ? "has-candidate-controls" : ""}`}
      style={editorStyle}
    >
      {headerActionsTarget
        ? createPortal(
            <div className="workspace-editor-actions">
              <button
                type="button"
                aria-label="Undo"
                disabled={!editor?.can().chain().focus().undo().run()}
                onClick={() => editor?.chain().focus().undo().run()}
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                aria-label="Redo"
                disabled={!editor?.can().chain().focus().redo().run()}
                onClick={() => editor?.chain().focus().redo().run()}
              >
                <Redo2 size={15} />
              </button>
              <button type="button" className="workspace-history" onClick={loadHistory}>
                <History size={14} /> <span>History</span>
              </button>
              <div className="typography-control workspace-typography-control">
                <button
                  type="button"
                  ref={typographyAnchorRef}
                  className={typographyOpen ? "active" : ""}
                  aria-label="Typography settings"
                  aria-expanded={typographyOpen}
                  onClick={(event) => toggleTypographyMenu(event.currentTarget)}
                >
                  Aa
                </button>
              </div>
              <button
                type="button"
                className="workspace-ai-command"
                disabled={!aiConfigured}
                title={aiConfigured ? "Add a Scene Beat" : "Configure OpenRouter in Settings"}
                onClick={() => {
                  const latestModel = localStorage.getItem("asterism-latest-model");
                  const attrs = latestModel ? { modelOverride: latestModel } : {};
                  editor?.chain().focus().insertContent({ type: "sceneBeat", attrs }).run();
                }}
              >
                <Sparkles size={15} /> <span>AI</span>
              </button>
            </div>,
            headerActionsTarget,
          )
        : null}
      <div className="editor-body">
        <div className="editor-frame continuous-editor-frame">
          <div className="editor-toolbar mobile-editor-toolbar">
            <button
              type="button"
              className="mobile-editor-context"
              aria-haspopup="dialog"
              aria-expanded={mobileNavigatorOpen}
              onClick={() => setMobileNavigatorOpen(true)}
            >
              <ListTree size={16} />
              <span>{scope.kind === "story" ? "Everything" : scopeDisplayLabel}</span>
            </button>
            <button
              type="button"
              aria-label="Undo"
              disabled={!editor?.can().chain().focus().undo().run()}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              aria-label="Redo"
              disabled={!editor?.can().chain().focus().redo().run()}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 size={15} />
            </button>
            <button
              type="button"
              className="icon-button desktop-editor-tool"
              disabled={selectedIndex <= 0}
              onClick={() => previousScene && onSelectScene(previousScene.id)}
              aria-label="Previous Scene"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-button desktop-editor-tool"
              disabled={selectedIndex < 0 || selectedIndex >= allScenes.length - 1}
              onClick={() => nextScene && onSelectScene(nextScene.id)}
              aria-label="Next Scene"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="button ghost desktop-editor-tool"
              onClick={loadHistory}
            >
              <History size={14} /> History
            </button>
            <span className="editor-toolbar-spacer" />
            <div className="typography-control desktop-editor-tool">
              <button
                type="button"
                className={typographyOpen ? "active" : ""}
                aria-label="Typography settings"
                aria-expanded={typographyOpen}
                onClick={() => setTypographyOpen((value) => !value)}
              >
                Aa
              </button>
              {typographyOpen
                ? createPortal(
                    <div
                      className="typography-menu typography-menu-portal"
                      style={
                        typographyMenuPosition
                          ? {
                              position: "fixed",
                              top: typographyMenuPosition.top,
                              right: "auto",
                              left: typographyMenuPosition.left,
                            }
                          : undefined
                      }
                    >
                      <div className="typography-menu-heading">
                        <strong>Typography</strong>
                        <button
                          type="button"
                          onClick={() => {
                            if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
                            setEditorSettings(editorSettingsDefaults);
                            settingsMutation.mutate(editorSettingsDefaults);
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <label>
                        Font
                        <select
                          value={editorSettings.fontFamily}
                          onChange={(event) =>
                            updateEditorSetting(
                              "fontFamily",
                              event.target.value as EditorSettings["fontFamily"],
                            )
                          }
                        >
                          <option value="literary">Literary serif</option>
                          <option value="classic">Classic serif</option>
                          <option value="sans">Readable sans-serif</option>
                        </select>
                      </label>
                      <label>
                        Font size
                        <select
                          value={editorSettings.fontSize}
                          onChange={(event) =>
                            updateEditorSetting(
                              "fontSize",
                              Number(event.target.value) as EditorSettings["fontSize"],
                            )
                          }
                        >
                          {[16, 18, 20, 22, 24].map((value) => (
                            <option key={value} value={value}>{`${value}px`}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Line spacing
                        <select
                          value={editorSettings.lineHeight}
                          onChange={(event) =>
                            updateEditorSetting(
                              "lineHeight",
                              Number(event.target.value) as EditorSettings["lineHeight"],
                            )
                          }
                        >
                          {[1.4, 1.6, 1.85, 2].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Paragraph spacing
                        <select
                          value={editorSettings.paragraphSpacing}
                          onChange={(event) =>
                            updateEditorSetting(
                              "paragraphSpacing",
                              Number(event.target.value) as EditorSettings["paragraphSpacing"],
                            )
                          }
                        >
                          {[0.5, 0.85, 1.15, 1.5].map((value) => (
                            <option key={value} value={value}>{`${value}em`}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        First-line indent
                        <select
                          value={editorSettings.firstLineIndent}
                          onChange={(event) =>
                            updateEditorSetting(
                              "firstLineIndent",
                              Number(event.target.value) as EditorSettings["firstLineIndent"],
                            )
                          }
                        >
                          {[0, 1, 1.5, 2].map((value) => (
                            <option key={value} value={value}>{`${value}em`}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Page width
                        <select
                          value={editorSettings.pageWidth}
                          onChange={(event) =>
                            updateEditorSetting(
                              "pageWidth",
                              Number(event.target.value) as EditorSettings["pageWidth"],
                            )
                          }
                        >
                          {[640, 760, 920, 1080].map((value) => (
                            <option key={value} value={value}>{`${value}px`}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Alignment
                        <select
                          value={editorSettings.textAlign}
                          onChange={(event) =>
                            updateEditorSetting(
                              "textAlign",
                              event.target.value as EditorSettings["textAlign"],
                            )
                          }
                        >
                          <option value="left">Left</option>
                          <option value="justify">Justified</option>
                          <option value="center">Centered</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
            <button
              type="button"
              className="mobile-editor-tools"
              aria-label="Writing tools"
              aria-haspopup="dialog"
              aria-expanded={mobileToolsOpen}
              onClick={() => setMobileToolsOpen(true)}
            >
              <MoreHorizontal size={18} />
            </button>
            <button
              type="button"
              className="ai-command"
              disabled={!aiConfigured}
              title={aiConfigured ? "Add a Scene Beat" : "Configure OpenRouter in Settings"}
              onClick={() => {
                const latestModel = localStorage.getItem("asterism-latest-model");
                const attrs = latestModel ? { modelOverride: latestModel } : {};
                editor?.chain().focus().insertContent({ type: "sceneBeat", attrs }).run();
              }}
            >
              <Sparkles size={15} /> AI /
            </button>
          </div>
          <StructureActionsContext.Provider value={{ create: createStructure }}>
            <EditorActionsContext.Provider
              value={{ aiConfigured, baseModel, entries, models, startGeneration }}
            >
              <EditorContent editor={editor} />
            </EditorActionsContext.Provider>
          </StructureActionsContext.Provider>
        </div>
      </div>
      {mobileNavigatorOpen ? (
        <div className="mobile-sheet-backdrop">
          <button
            type="button"
            className="mobile-sheet-dismiss"
            aria-label="Close manuscript navigator"
            onClick={() => setMobileNavigatorOpen(false)}
          />
          <section
            className="mobile-sheet mobile-manuscript-navigator"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-manuscript-navigator-title"
            onKeyDown={trapFocusWithin}
          >
            <div className="mobile-sheet-handle" />
            <header>
              <h2 id="mobile-manuscript-navigator-title">Manuscript navigator</h2>
              <button
                type="button"
                className="icon-button"
                ref={mobileNavigatorCloseRef}
                aria-label="Close manuscript navigator"
                onClick={() => setMobileNavigatorOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <button
              type="button"
              className={scope.kind === "story" ? "active" : ""}
              onClick={() => {
                setMobileNavigatorOpen(false);
                onSelectScope({ kind: "story" });
              }}
            >
              Everything
            </button>
            <div className="mobile-manuscript-tree">
              {tree.acts.map((act) => (
                <section className="mobile-nav-act" key={act.id}>
                  <button
                    type="button"
                    className={scope.kind === "act" && scope.id === act.id ? "active" : ""}
                    onClick={() => {
                      setMobileNavigatorOpen(false);
                      onSelectScope({ kind: "act", id: act.id });
                    }}
                  >
                    {structureLabels.acts.get(act.id)?.label}
                  </button>
                  {act.chapters.map((chapter) => (
                    <div className="mobile-nav-chapter" key={chapter.id}>
                      <button
                        type="button"
                        className={
                          scope.kind === "chapter" && scope.id === chapter.id ? "active" : ""
                        }
                        onClick={() => {
                          setMobileNavigatorOpen(false);
                          onSelectScope({ kind: "chapter", id: chapter.id });
                        }}
                      >
                        {structureLabels.chapters.get(chapter.id)?.label}
                      </button>
                      {chapter.scenes.map((scene) => (
                        <button
                          key={scene.id}
                          type="button"
                          className={activeSceneId === scene.id ? "active scene" : "scene"}
                          onClick={() => {
                            setMobileNavigatorOpen(false);
                            onSelectScene(scene.id);
                          }}
                        >
                          {structureLabels.scenes.get(scene.id)?.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {mobileToolsOpen ? (
        <div className="mobile-sheet-backdrop">
          <button
            type="button"
            className="mobile-sheet-dismiss"
            aria-label="Close writing tools"
            onClick={() => setMobileToolsOpen(false)}
          />
          <section
            className="mobile-sheet mobile-writing-tools"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-writing-tools-title"
            onKeyDown={trapFocusWithin}
          >
            <div className="mobile-sheet-handle" />
            <header>
              <h2 id="mobile-writing-tools-title">Writing tools</h2>
              <button
                type="button"
                className="icon-button"
                ref={mobileToolsCloseRef}
                aria-label="Close writing tools"
                onClick={() => setMobileToolsOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="mobile-writing-tool-grid">
              <button
                type="button"
                disabled={!previousScene}
                onClick={() => {
                  setMobileToolsOpen(false);
                  if (previousScene) onSelectScene(previousScene.id);
                }}
              >
                <ChevronLeft size={17} /> Previous scene
              </button>
              <button
                type="button"
                disabled={!nextScene}
                onClick={() => {
                  setMobileToolsOpen(false);
                  if (nextScene) onSelectScene(nextScene.id);
                }}
              >
                Next scene <ChevronRight size={17} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileToolsOpen(false);
                  void loadHistory();
                }}
              >
                <History size={17} /> Scene history
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileToolsOpen(false);
                  setTypographyMenuPosition(null);
                  setTypographyOpen(true);
                }}
              >
                Aa Typography
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectionMenu && !selectionPanel && !active ? (
        <div
          className="selection-action-menu"
          role="toolbar"
          aria-label="Revise selected text"
          style={{ top: selectionMenu.top, left: selectionMenu.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="selection-format-row">
            <span className="selection-word-count">
              {selectedWordCount} {selectedWordCount === 1 ? "word" : "words"}
            </span>
            <span className="selection-menu-divider" />
            <button
              type="button"
              className={editor?.isActive("bold") ? "active" : ""}
              aria-label="Bold"
              title="Bold (**text**)"
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={editor?.isActive("italic") ? "active" : ""}
              aria-label="Italic"
              title="Italic (*text*)"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={editor?.isActive("underline") ? "active" : ""}
              aria-label="Underline"
              title="Underline (_text_)"
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <u>U</u>
            </button>
            <select
              aria-label="Text style"
              title="Heading style (#, ##, ###)"
              value={
                editor?.isActive("heading", { level: 1 })
                  ? "1"
                  : editor?.isActive("heading", { level: 2 })
                    ? "2"
                    : editor?.isActive("heading", { level: 3 })
                      ? "3"
                      : "0"
              }
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                const level = Number(event.target.value);
                if (level === 0) editor?.chain().focus().setParagraph().run();
                else
                  editor
                    ?.chain()
                    .focus()
                    .toggleHeading({ level: level as 1 | 2 | 3 })
                    .run();
              }}
            >
              <option value="0">P</option>
              <option value="1">H1</option>
              <option value="2">H2</option>
              <option value="3">H3</option>
            </select>
            <button
              type="button"
              className={editor?.isActive("bulletList") ? "active" : ""}
              aria-label="Bulleted list"
              title="Bulleted list (- item)"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              UL
            </button>
            <button
              type="button"
              className={editor?.isActive("orderedList") ? "active" : ""}
              aria-label="Numbered list"
              title="Numbered list (1. item)"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              1.
            </button>
            <button
              type="button"
              className={editor?.isActive("blockquote") ? "active" : ""}
              aria-label="Blockquote"
              title="Blockquote (> text)"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              &quot;
            </button>
            <button
              type="button"
              aria-label="Clear formatting"
              title="Clear formatting"
              onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              Tx
            </button>
          </div>
          <div className="selection-ai-row">
            {selectionActions.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                disabled={!aiConfigured}
                onClick={() => {
                  setSelectionPanel({
                    ...selectionMenu,
                    action,
                    instructions: "",
                    modelOverride: null,
                  });
                  setSelectionMenu(null);
                }}
              >
                <Sparkles size={12} /> {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {selectionPanel && !active ? (
        <section
          className="selection-revision-panel"
          aria-label="Revise selected text"
          style={{
            top: Math.max(12, selectionPanel.top),
            left: selectionPanel.left,
            maxHeight: `calc(var(--visual-viewport-height, 100dvh) - ${Math.max(12, selectionPanel.top) + 12}px)`,
          }}
        >
          <div className="selection-revision-heading">
            <strong>Revise selection</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Close selection revision"
              onClick={() => setSelectionPanel(null)}
            >
              <X size={15} />
            </button>
          </div>
          <label>
            Action
            <select
              value={selectionPanel.action}
              onChange={(event) =>
                setSelectionPanel({
                  ...selectionPanel,
                  action: event.target.value as SelectionAction,
                })
              }
            >
              {selectionActions.map(({ action, label }) => (
                <option key={action} value={action}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Extra instructions
            <textarea
              value={selectionPanel.instructions}
              placeholder={
                selectionPanel.action === "custom"
                  ? "Describe the revision you want..."
                  : "Optional guidance..."
              }
              onChange={(event) =>
                setSelectionPanel({ ...selectionPanel, instructions: event.target.value })
              }
            />
          </label>
          <div className="selection-model-field">
            <span>Model</span>
            <ModelSelect
              value={selectionPanel.modelOverride ?? baseModel}
              placement="auto"
              onChange={(value) =>
                setSelectionPanel({
                  ...selectionPanel,
                  modelOverride: value === baseModel ? null : value,
                })
              }
              models={models}
            />
          </div>
          <div className="selection-revision-actions">
            <button type="button" className="button ghost" onClick={() => setSelectionPanel(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={
                !aiConfigured ||
                (selectionPanel.action === "custom" && !selectionPanel.instructions.trim())
              }
              onClick={generateSelectionRevision}
            >
              <Sparkles size={14} /> Generate
            </button>
          </div>
        </section>
      ) : null}
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
              const remote = await asterism().manuscript.scene(sceneId);
              versionRefs.current.set(sceneId, remote.version);
              documentRefs.current.set(sceneId, JSON.stringify(remote.document));
              onSaved(remote);
              editor.commands.setContent(compositeDocument(updateSceneInTree(tree, remote), scope));
              setConflicts((current) => {
                const next = new Set(current);
                next.delete(sceneId);
                return next;
              });
            }}
          >
            <RotateCcw size={13} /> Reload saved version
          </button>
        </div>
      ) : null}
      {active ? (
        <div ref={candidateControlsRef} className="candidate-controls">
          <span>
            {active.status === "streaming" ? (
              <>
                <RefreshCw className="spin" size={15} />
                {active.continuation > 0
                  ? `Asterism is continuing… (${active.continuation + 1})`
                  : active.previousText === null
                    ? "Asterism is writing…"
                    : "Asterism is rewriting…"}
              </>
            ) : active.status === "complete" ? (
              "Candidate ready"
            ) : (
              "Generation failed"
            )}
          </span>
          <div>
            {active.status === "streaming" ? (
              <>
                <button type="button" className="button ghost" onClick={cancel}>
                  <X size={15} /> Cancel
                </button>
                <button type="button" className="button ghost" onClick={stop}>
                  <Square size={15} /> Stop
                </button>
              </>
            ) : (
              <>
                <button type="button" className="button ghost" onClick={reject}>
                  <Trash2 size={15} /> Reject
                </button>
                <button type="button" className="button ghost" onClick={() => void regenerate()}>
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
      {error || settingsQuery.error || settingsMutation.error ? (
        <ErrorNotice error={error ?? settingsQuery.error ?? settingsMutation.error} />
      ) : null}
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
                      const restored = await asterism().manuscript.restoreRevision(
                        activeSceneId,
                        revision.id,
                      );
                      versionRefs.current.set(restored.id, restored.version);
                      documentRefs.current.set(restored.id, JSON.stringify(restored.document));
                      onSaved(restored);
                      editor?.commands.setContent(
                        compositeDocument(updateSceneInTree(tree, restored), scope),
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
