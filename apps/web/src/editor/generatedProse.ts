import type { JSONContent } from "@tiptap/core";

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
