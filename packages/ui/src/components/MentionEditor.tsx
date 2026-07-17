import type { CompendiumEntry } from "@skriv/contracts";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { CompendiumMentions, setCompendiumMentionEntries } from "../editor/CompendiumMentions.js";

function plainTextDocument(value: string): JSONContent {
  return {
    type: "doc",
    content: value.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

export function MentionEditor({
  value,
  entries,
  onValueChange,
  wrapperClassName = "",
  className = "",
  placeholder = "",
  ariaLabel,
  spellCheck = false,
}: {
  value: string;
  entries: readonly CompendiumEntry[];
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  spellCheck?: boolean;
}) {
  const onValueChangeRef = useRef(onValueChange);
  const placeholderRef = useRef(placeholder);
  onValueChangeRef.current = onValueChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      CompendiumMentions.configure({ entries, includeUntracked: true }),
    ],
    content: plainTextDocument(value),
    editorProps: {
      attributes: {
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        "aria-multiline": "true",
        class: className,
        placeholder,
        role: "textbox",
        spellcheck: String(spellCheck),
      },
    },
    onUpdate({ editor: current }) {
      onValueChangeRef.current(current.getText({ blockSeparator: "\n" }));
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) setCompendiumMentionEntries(editor, entries);
  }, [editor, entries]);

  useEffect(() => {
    placeholderRef.current = placeholder;
    if (editor && !editor.isDestroyed) {
      editor.view.dom.setAttribute("placeholder", placeholder);
      editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
    }
  }, [editor, placeholder]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.getText({ blockSeparator: "\n" }) === value) return;
    editor.commands.setContent(plainTextDocument(value), { emitUpdate: false });
  }, [editor, value]);

  return <EditorContent editor={editor} className={`mention-editor ${wrapperClassName}`.trim()} />;
}
