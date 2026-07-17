import type { CompendiumEntry, ExtractCompendiumFromTextResponse } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import {
  extractionReviewImportEntries,
  extractionReviewIsValid,
  prepareExtractionReview,
  renameExtractionDraft,
} from "./CompendiumExtractionReview.js";

function entry(name: string, aliases: string[] = []): CompendiumEntry {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    name,
    typeId: "story.character",
    aliases,
    labels: [],
    imageDataUrl: null,
    trackingEnabled: true,
    matchExclusions: [],
    activationMode: "mention",
    caseSensitive: false,
    content: { kind: "text", text: "" },
    revision: 3,
    singleton: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function suggestion(
  duplicateCandidates: ExtractCompendiumFromTextResponse["suggestions"][number]["duplicateCandidates"],
) {
  return {
    id: crypto.randomUUID(),
    name: "Ash",
    typeId: "story.character" as const,
    description: "A new detail.",
    evidence: "Ash waited.",
    duplicateCandidates,
  };
}

describe("Compendium extraction review", () => {
  it("automatically selects a unique existing target and serializes its revision", () => {
    const ash = entry("The Captain", ["Ash"]);
    const [review] = prepareExtractionReview([
      suggestion([{ id: ash.id, name: ash.name, typeId: ash.typeId, revision: ash.revision }]),
    ]);
    expect(review).toEqual(
      expect.objectContaining({
        existingEntryId: ash.id,
        expectedExistingRevision: ash.revision,
      }),
    );
    expect(extractionReviewIsValid(review ? [review] : [])).toBe(true);
    expect(extractionReviewImportEntries(review ? [review] : [])[0]).toEqual(
      expect.objectContaining({ existingEntryId: ash.id, expectedExistingRevision: 3 }),
    );
  });

  it("requires an explicit choice when an alias belongs to multiple entries", () => {
    const first = entry("The Captain", ["Ash"]);
    const second = entry("Ash Tree", ["Ash"]);
    const [review] = prepareExtractionReview([
      suggestion(
        [first, second].map(({ id, name, typeId, revision }) => ({
          id,
          name,
          typeId,
          revision,
        })),
      ),
    ]);
    expect(review?.existingEntryId).toBeNull();
    expect(extractionReviewIsValid(review ? [review] : [])).toBe(false);
  });

  it("recomputes duplicate targets with canonical normalization after a rename", () => {
    const mara = entry("Mara Vale", ["The Investigator"]);
    const [review] = prepareExtractionReview([suggestion([])]);
    if (!review) throw new Error("Expected a review draft.");
    const renamed = renameExtractionDraft(review, "ＴＨＥ ＩＮＶＥＳＴＩＧＡＴＯＲ", [mara]);
    expect(renamed.existingEntryId).toBe(mara.id);
    expect(renamed.duplicateCandidates).toHaveLength(1);
  });
});
