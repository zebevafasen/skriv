import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { MarkdownEditingShortcuts } from "../editor/MarkdownEditing.js";

function typeText(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const defaultTransaction = () => editor.state.tr.insertText(character, from, to);
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      handler(editor.view, from, to, character, defaultTransaction),
    );
    if (!handled) editor.view.dispatch(defaultTransaction());
  }
}

describe("chat editor keyboard behavior", () => {
  it("starts a paragraph after a heading when Shift+Enter is pressed", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [MarkdownEditingShortcuts, StarterKit],
      content: "<h1>Heading</h1>",
    });

    editor.commands.setTextSelection(8);
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(editor.getJSON().content?.slice(0, 2)).toEqual([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Heading" }],
      },
      { type: "paragraph" },
    ]);

    typeText(editor, "## Heading 2");

    expect(editor.getJSON().content?.[1]).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Heading 2" }],
    });
    editor.destroy();
  });
});
