import type { CompendiumEntry } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import {
  appendCompendiumContent,
  formatCompendiumExtractionContext,
  parseCompendiumExtraction,
  prepareCompendiumExtractionSuggestions,
  protectedProtocolMessage,
  validateCompendiumImport,
} from "./index.js";

function entry(name: string, overrides: Partial<CompendiumEntry> = {}): CompendiumEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    projectId: overrides.projectId ?? crypto.randomUUID(),
    name,
    typeId: overrides.typeId ?? "story.character",
    aliases: overrides.aliases ?? [],
    labels: [],
    imageDataUrl: null,
    trackingEnabled: true,
    matchExclusions: [],
    activationMode: "mention",
    caseSensitive: false,
    content: overrides.content ?? { kind: "text", text: "Canonical details." },
    revision: overrides.revision ?? 1,
    singleton: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const draft = {
  name: "Mara",
  typeId: "story.character" as const,
  description: "An investigator.",
  evidence: "Mara entered.",
};

describe("Compendium extraction primitives", () => {
  it("parses bare, fenced, and reasoning-prefixed JSON while rejecting invalid categories", () => {
    const extraction = JSON.stringify({ entries: [draft] });
    expect(parseCompendiumExtraction(extraction).entries).toHaveLength(1);
    expect(parseCompendiumExtraction(`\`\`\`json\n${extraction}\n\`\`\``).entries).toHaveLength(1);
    expect(
      parseCompendiumExtraction(`<think>Reasoning.</think>\nResult:\n${extraction}`).entries,
    ).toHaveLength(1);
    expect(() =>
      parseCompendiumExtraction(
        JSON.stringify({ entries: [{ ...draft, typeId: "project.themes" }] }),
      ),
    ).toThrow();
  });

  it("deduplicates normalized model suggestions and preserves every ambiguous alias target", () => {
    const captain = entry("The Captain", { aliases: ["Ash"], revision: 2 });
    const tree = entry("Ash Tree", { aliases: ["Ash"], revision: 4 });
    const ids = ["10000000-0000-4000-8000-000000000001"];
    const suggestions = prepareCompendiumExtractionSuggestions(
      [
        { ...draft, name: "ＡＳＨ" },
        { ...draft, name: "ash" },
      ],
      [captain, tree],
      () => ids.shift() ?? crypto.randomUUID(),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.duplicateCandidates.map((candidate) => candidate.id)).toEqual([
      tree.id,
      captain.id,
    ]);
  });

  it("requires an explicit target for duplicate names and validates revisions atomically", () => {
    const first = entry("First", { aliases: ["Shared"], revision: 2 });
    const second = entry("Second", { aliases: ["Shared"], revision: 5 });
    const createShared = {
      ...draft,
      name: "Shared",
      existingEntryId: null,
      expectedExistingRevision: null,
    };
    expect(validateCompendiumImport([createShared], [first, second])).toEqual([
      expect.objectContaining({ reason: "duplicate_name" }),
    ]);
    expect(
      validateCompendiumImport(
        [{ ...createShared, existingEntryId: second.id, expectedExistingRevision: 5 }],
        [first, second],
      ),
    ).toEqual([]);
    expect(
      validateCompendiumImport(
        [{ ...createShared, existingEntryId: second.id, expectedExistingRevision: 4 }],
        [first, second],
      ),
    ).toEqual([expect.objectContaining({ reason: "revision_changed" })]);
    expect(
      validateCompendiumImport(
        [{ ...createShared, existingEntryId: crypto.randomUUID(), expectedExistingRevision: 1 }],
        [first, second],
      ),
    ).toEqual([expect.objectContaining({ reason: "missing_target" })]);
    expect(
      validateCompendiumImport(
        [
          { ...createShared, existingEntryId: second.id, expectedExistingRevision: 5 },
          {
            ...createShared,
            name: "Second",
            existingEntryId: second.id,
            expectedExistingRevision: 5,
          },
        ],
        [first, second],
      ),
    ).toEqual([expect.objectContaining({ reason: "duplicate_target" })]);
  });

  it("preserves rich-text nodes when appending extracted details", () => {
    expect(
      appendCompendiumContent(
        {
          kind: "rich_text",
          plainText: "Existing details.",
          document: {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: "Existing details." }],
              },
            ],
          },
        },
        "New details.",
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "rich_text",
        plainText: "Existing details.\n\nNew details.",
        document: expect.objectContaining({
          content: [
            expect.objectContaining({ type: "heading" }),
            expect.objectContaining({ type: "paragraph" }),
          ],
        }),
      }),
    );
  });

  it("prioritizes mentioned entries and stays within a bounded existing-entry context", () => {
    const unmentioned = entry("Alpha", {
      content: { kind: "text", text: "Unmentioned details. ".repeat(100) },
    });
    const mentioned = entry("Zora", {
      content: { kind: "text", text: "Mentioned details. ".repeat(100) },
    });
    const formatted = formatCompendiumExtractionContext(
      [unmentioned, mentioned],
      "Zora entered.",
      80,
    );
    expect(formatted.split("\n")[0]).toContain("Zora");
    expect(formatted).toContain("omitted to fit the model context");
  });

  it("uses the strict factual protocol for both extraction workflows", () => {
    for (const workflow of ["ideation.compendium_extract", "compendium.extract"] as const) {
      const protocol = protectedProtocolMessage(workflow);
      expect(protocol.role).toBe("developer");
      expect(protocol.content).toContain("untrusted source data");
      expect(protocol.content).toContain("JSON object");
    }
  });
});
