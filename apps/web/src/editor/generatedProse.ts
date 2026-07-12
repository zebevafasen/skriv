import type { JSONContent } from "@tiptap/core";

type InlineDelimiter = {
  marker: string;
  marks: string[];
};

const inlineDelimiters: InlineDelimiter[] = [
  { marker: "***", marks: ["bold", "italic"] },
  { marker: "**", marks: ["bold"] },
  { marker: "*", marks: ["italic"] },
  { marker: "_", marks: ["underline"] },
];

function hasUnescapedDelimiter(text: string, marker: string, from: number) {
  for (
    let index = text.indexOf(marker, from);
    index >= 0;
    index = text.indexOf(marker, index + 1)
  ) {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
    if (slashes % 2 === 0) return true;
  }
  return false;
}

export function generatedInlineContent(text: string): JSONContent[] {
  const content: JSONContent[] = [];
  const stack: InlineDelimiter[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    const markNames = [...new Set(stack.flatMap((delimiter) => delimiter.marks))];
    content.push({
      type: "text",
      text: buffer,
      ...(markNames.length ? { marks: markNames.map((type) => ({ type })) } : {}),
    });
    buffer = "";
  };

  for (let index = 0; index < text.length; ) {
    if (text[index] === "\\" && index + 1 < text.length) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    const active = stack.at(-1);
    if (active && text.startsWith(active.marker, index)) {
      flush();
      stack.pop();
      index += active.marker.length;
      continue;
    }

    const opening = inlineDelimiters.find(
      ({ marker }) =>
        text.startsWith(marker, index) &&
        hasUnescapedDelimiter(text, marker, index + marker.length),
    );
    if (opening) {
      flush();
      stack.push(opening);
      index += opening.marker.length;
      continue;
    }

    buffer += text[index];
    index += 1;
  }

  if (stack.length) {
    const unmatchedPrefix = stack.map(({ marker }) => marker).join("");
    buffer = unmatchedPrefix + buffer;
    stack.length = 0;
  }
  flush();
  return content;
}

function paragraph(lines: string[]): JSONContent {
  const content: JSONContent[] = [];
  lines.forEach((line, index) => {
    content.push(...generatedInlineContent(line));
    if (index < lines.length - 1) content.push({ type: "hardBreak" });
  });
  return { type: "paragraph", ...(content.length ? { content } : {}) };
}

function list(type: "bulletList" | "orderedList", lines: string[], start?: number): JSONContent {
  return {
    type,
    ...(type === "orderedList" && start !== undefined ? { attrs: { start } } : {}),
    content: lines.map((line) => ({
      type: "listItem",
      content: [paragraph([line])],
    })),
  };
}

export function generatedProseContent(text: string): JSONContent[] {
  const lines = text.trim().replace(/\r\n?/g, "\n").split("\n");
  const content: JSONContent[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading) {
      content.push({
        type: "heading",
        attrs: { level: heading[1]?.length ?? 1 },
        content: generatedInlineContent(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }

    if (/^\s*(?:---|\*\*\*)\s*$/u.test(line)) {
      content.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/u, ""));
        index += 1;
      }
      content.push({ type: "blockquote", content: [paragraph(quoteLines)] });
      continue;
    }

    if (/^\s*[-+]\s+/u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-+]\s+/u.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-+]\s+/u, ""));
        index += 1;
      }
      content.push(list("bulletList", items));
      continue;
    }

    const ordered = /^\s*(\d+)\.\s+(.+)$/u.exec(line);
    if (ordered) {
      const items: string[] = [];
      const start = Number(ordered[1]);
      while (index < lines.length) {
        const item = /^\s*\d+\.\s+(.+)$/u.exec(lines[index] ?? "");
        if (!item) break;
        items.push(item[1] ?? "");
        index += 1;
      }
      content.push(list("orderedList", items, start));
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim()) {
      const next = lines[index] ?? "";
      if (
        paragraphLines.length > 0 &&
        (/^(#{1,3})\s+/u.test(next) ||
          /^>\s?/u.test(next) ||
          /^\s*[-+]\s+/u.test(next) ||
          /^\s*\d+\.\s+/u.test(next) ||
          /^\s*(?:---|\*\*\*)\s*$/u.test(next))
      )
        break;
      paragraphLines.push(next);
      index += 1;
    }
    content.push(paragraph(paragraphLines));
  }

  return content;
}
