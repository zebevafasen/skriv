import { Extension } from "@tiptap/core";

export const MarkdownEditingShortcuts = Extension.create({
  name: "markdownEditingShortcuts",
  priority: 1_000,
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => this.editor.commands.keyboardShortcut("Enter"),
    };
  },
});
