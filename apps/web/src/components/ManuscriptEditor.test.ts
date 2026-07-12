import type { ManuscriptTree, Scene } from "@asterism/contracts";
import { describe, expect, it } from "vitest";
import { compositeDocument, selectionReplacementContent } from "./ManuscriptEditor.js";

const scene = (id: string, title: string, position: number): Scene => ({
  id,
  chapterId: crypto.randomUUID(),
  title,
  position,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
  },
  plainText: title,
  version: 1,
  metadata: {
    summary: "",
    povEntryId: null,
    locationEntryId: null,
    presentCharacterEntryIds: [],
    goal: "",
    notes: "",
    status: "draft",
    labels: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("composite manuscript documents", () => {
  it("keeps ordered Scene identities and canonical content in isolated blocks", () => {
    const projectId = crypto.randomUUID();
    const first = scene(crypto.randomUUID(), "First", 0);
    const second = scene(crypto.randomUUID(), "Second", 1);
    const tree: ManuscriptTree = {
      project: {
        id: projectId,
        workspaceId: crypto.randomUUID(),
        title: "Story",
        settings: {
          author: "",
          series: "",
          seriesIndex: "",
          coverDataUrl: null,
          tense: "Past",
          language: "General English",
          povType: "3rd Person (Limited)",
          povCharacterEntryId: null,
          notes: "",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      acts: [
        {
          id: crypto.randomUUID(),
          projectId,
          title: "Act One",
          position: 0,
          chapters: [
            {
              id: first.chapterId,
              actId: crypto.randomUUID(),
              title: "Chapter One",
              position: 0,
              scenes: [first, second],
            },
          ],
        },
      ],
    };
    const document = compositeDocument(tree, { kind: "story" });
    const blocks = document.content?.filter((node) => node.type === "sceneBlock") ?? [];
    expect(blocks.map((block) => block.attrs?.sceneId)).toEqual([first.id, second.id]);
    expect(blocks[1]?.content?.[0]?.content?.[0]?.text).toBe("Second");
  });

  it("normalizes inline AI replacements without creating block nodes", () => {
    expect(selectionReplacementContent(" First line\nsecond line ", true)).toBe(
      "First line second line",
    );
  });

  it("parses multi-paragraph AI replacements into Tiptap blocks", () => {
    expect(selectionReplacementContent("First paragraph.\n\nSecond paragraph.", false)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First paragraph." }] },
      { type: "paragraph", content: [{ type: "text", text: "Second paragraph." }] },
    ]);
  });
});
