import type { ManuscriptTree, Scene } from "@asterism/contracts";
import { describe, expect, it } from "vitest";
import { compositeDocument, selectionReplacementContent } from "../editor/manuscriptDocument.js";
import { candidateControlsLayout } from "../utils/manuscript.js";

describe("candidate controls layout", () => {
  it("tracks the center of the manuscript editor when its sidebar changes", () => {
    expect(candidateControlsLayout({ left: 0, width: 1_440 })).toEqual({
      centerX: 720,
      editorWidth: 1_440,
    });
    expect(candidateControlsLayout({ left: 380, width: 1_060 })).toEqual({
      centerX: 910,
      editorWidth: 1_060,
    });
  });
});

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
    manualCompendiumEntryIds: [],
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
          labelPacks: [],
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
    expect(blocks.map((block) => block.attrs?.displayLabel)).toEqual([
      "Scene 1: First",
      "Scene 2: Second",
    ]);
    expect(blocks[1]?.attrs?.isLastInChapter).toBe(true);
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

  it("converts generated inline Markdown into editor marks", () => {
    expect(
      selectionReplacementContent(
        "Zebe was **certain**, *quietly amused*, and _not backing down_.",
        true,
      ),
    ).toEqual([
      { type: "text", text: "Zebe was " },
      { type: "text", text: "certain", marks: [{ type: "bold" }] },
      { type: "text", text: ", " },
      { type: "text", text: "quietly amused", marks: [{ type: "italic" }] },
      { type: "text", text: ", and " },
      { type: "text", text: "not backing down", marks: [{ type: "underline" }] },
      { type: "text", text: "." },
    ]);
  });

  it("converts generated headings and lists into editor blocks", () => {
    expect(selectionReplacementContent("## Next beat\n\n- **Arrive**\n- React", false)).toEqual([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Next beat" }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Arrive", marks: [{ type: "bold" }] }],
              },
            ],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "React" }] }],
          },
        ],
      },
    ]);
  });
});
