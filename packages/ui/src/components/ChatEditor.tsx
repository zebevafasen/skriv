import type { CompendiumEntry } from "@skriv/contracts";
import { findMentions } from "@skriv/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import { MarkdownEditingShortcuts } from "../editor/MarkdownEditing.js";
import { setMentionDecorations, SkrivDecorations } from "../editor/SkrivDecorations.js";

interface ChatEditorProps {
  value: string;
  entries: CompendiumEntry[];
  onChange: (value: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  wrapperClassName?: string;
}

export function ChatEditor({
  value,
  entries,
  onChange,
  onKeyDown,
  wrapperClassName = "",
}: ChatEditorProps) {
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const editor = useEditor({
    extensions: [
      MarkdownEditingShortcuts,
      StarterKit.configure({
        dropcursor: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: "Ask anything about this project... (Markdown supported)",
      }),
      Markdown.configure({
        transformPastedText: false,
        transformCopiedText: false,
      }),
      SkrivDecorations,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "mention-textarea chat-input prose prose-sm prose-invert chat-markdown",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      // @ts-expect-error - Markdown is available via tiptap-markdown
      onChange(editor.storage.markdown.getMarkdown());

      // Highlight mentions
      const mentions: Array<{ from: number; to: number; entryIds: string[] }> = [];
      editor.state.doc.descendants((node, position) => {
        if (!node.isText || !node.text) return;
        for (const match of findMentions(node.text, entriesRef.current, {
          includeUntracked: true,
        })) {
          mentions.push({
            from: position + match.from,
            to: position + match.to,
            entryIds: match.entryIds,
          });
        }
      });
      setMentionDecorations(editor, mentions);
    },
  });

  useEffect(() => {
    if (editor?.isEmpty && value === "") {
      // Do nothing, already empty
    } else if (editor && value === "") {
      editor.commands.setContent("");
    }
  }, [editor, value]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Tiptap wrapper needs keydown to submit chat
    <div
      className={`chat-input-layer ${wrapperClassName}`}
      role="presentation"
      onKeyDown={onKeyDown}
    >
      <EditorContent editor={editor} className="chat-editor-container" />
    </div>
  );
}
