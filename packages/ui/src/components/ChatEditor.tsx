import type { CompendiumEntry } from "@skriv/contracts";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";
import { CompendiumMentions, setCompendiumMentionEntries } from "../editor/CompendiumMentions.js";
import { MarkdownEditingShortcuts } from "../editor/MarkdownEditing.js";

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
  const editor = useEditor({
    extensions: [
      MarkdownEditingShortcuts,
      StarterKit.configure({
        dropcursor: false,
        underline: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: "Ask anything about this project... (Markdown supported)",
      }),
      Markdown.configure({
        transformPastedText: false,
        transformCopiedText: false,
      }),
      CompendiumMentions.configure({ entries, includeUntracked: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        "aria-label": "Chat message",
        "aria-multiline": "true",
        class: "chat-input prose prose-sm prose-invert chat-markdown",
        role: "textbox",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      // @ts-expect-error - Markdown is available via tiptap-markdown
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  useEffect(() => {
    if (editor) setCompendiumMentionEntries(editor, entries);
  }, [editor, entries]);

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
