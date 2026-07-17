import { describe, expect, it } from "vitest";
import { clearIngredientValues, DEFAULT_FIRST_SCENE_TARGET_LENGTH } from "./IdeationPanel.js";
import { prepareExtractionReview } from "./CompendiumExtractionReview.js";

describe("Ideation ingredient clearing", () => {
  const values = [
    { label: "Locked", locked: true },
    { label: "Open", locked: false },
  ];

  it("preserves locked values during a normal clear", () => {
    expect(clearIngredientValues(values)).toEqual([{ label: "Locked", locked: true }]);
  });

  it("can explicitly clear locked values too", () => {
    expect(clearIngredientValues(values, true)).toEqual([]);
  });
});

describe("premise development defaults", () => {
  it("defaults first-Scene setup to 1,000 words", () => {
    expect(DEFAULT_FIRST_SCENE_TARGET_LENGTH).toBe(1_000);
  });

  it("selects both new drafts and drafts that will append to existing entries", () => {
    const duplicateId = crypto.randomUUID();
    const draft = {
      id: crypto.randomUUID(),
      name: "Mara",
      typeId: "story.character" as const,
      description: "An investigator.",
      evidence: "Mara",
    };
    expect(
      prepareExtractionReview([
        { ...draft, duplicateCandidates: [] },
        {
          ...draft,
          id: crypto.randomUUID(),
          duplicateCandidates: [
            {
              id: duplicateId,
              name: "Mara",
              typeId: "story.character",
              revision: 3,
            },
          ],
        },
      ]).map((entry) => entry.selected),
    ).toEqual([true, true]);
  });
});
