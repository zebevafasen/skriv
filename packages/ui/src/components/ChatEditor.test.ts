import type { CompendiumEntry } from "@skriv/contracts";
import { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { Markdown } from "tiptap-markdown";
import { CompendiumMentions } from "../editor/CompendiumMentions.js";
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
  it("extends a shorter alias underline to the full entry name while typing", () => {
    const now = new Date().toISOString();
    const harbor: CompendiumEntry = {
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      name: "New Harbor City",
      typeId: "story.location",
      aliases: ["New Harbor"],
      labels: [],
      imageDataUrl: null,
      trackingEnabled: true,
      matchExclusions: [],
      activationMode: "mention",
      caseSensitive: false,
      content: { kind: "text", text: "" },
      revision: 1,
      singleton: false,
      createdAt: now,
      updatedAt: now,
    };
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [
        MarkdownEditingShortcuts,
        StarterKit.configure({ dropcursor: false, underline: false }),
        Underline,
        Placeholder,
        Markdown.configure({ transformPastedText: false, transformCopiedText: false }),
        CompendiumMentions.configure({ entries: [harbor], includeUntracked: true }),
      ],
      content: "",
    });

    typeText(editor, "New Harbor City");

    expect(
      [...element.querySelectorAll<HTMLElement>(".compendium-mention")]
        .map((node) => node.textContent)
        .join(""),
    ).toBe("New Harbor City");
    editor.destroy();
  });

  it("underlines the full entry when the editor inserts a non-breaking space", () => {
    const now = new Date().toISOString();
    const harbor: CompendiumEntry = {
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      name: "New Harbor City",
      typeId: "story.location",
      aliases: ["New Harbor"],
      labels: [],
      imageDataUrl: null,
      trackingEnabled: true,
      matchExclusions: [],
      activationMode: "mention",
      caseSensitive: false,
      content: { kind: "text", text: "" },
      revision: 1,
      singleton: false,
      createdAt: now,
      updatedAt: now,
    };
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [
        MarkdownEditingShortcuts,
        StarterKit.configure({ dropcursor: false, underline: false }),
        Underline,
        Placeholder,
        Markdown.configure({ transformPastedText: false, transformCopiedText: false }),
        CompendiumMentions.configure({ entries: [harbor], includeUntracked: true }),
      ],
      content: "",
    });

    typeText(editor, "New Harbor\u00a0City");

    expect(element.querySelector(".compendium-mention")?.textContent).toBe("New Harbor\u00a0City");
    editor.destroy();
  });

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
