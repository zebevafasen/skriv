import type { CompendiumEntry, PromptDefinition } from "@skriv/contracts";
import {
  appendCompendiumContent,
  discoverReferences,
  formatCompendiumReferences,
  indexCompendiumEntryNames,
  parseCompendiumExtraction,
} from "@skriv/core";
import { describe, expect, it } from "vitest";
import { hasInvalidIdeationReferenceIds, ideationPromptMessages } from "./routes/ideation.js";

function entry(name: string, content: string): CompendiumEntry {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    name,
    typeId: "story.character",
    aliases: [],
    labels: [],
    imageDataUrl: null,
    trackingEnabled: true,
    matchExclusions: [],
    activationMode: "mention",
    caseSensitive: false,
    content: { kind: "text", text: content },
    revision: 1,
    singleton: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function prompt(messages: PromptDefinition["messages"], variables: string[]): PromptDefinition {
  return {
    id: "test.ideation",
    name: "Test Ideation",
    workflow: "ideation.premise",
    version: 1,
    description: "",
    ownership: "user",
    sourcePromptId: null,
    messages,
    variables,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("Ideation Compendium context", () => {
  it("keeps direct roots ahead of recursive references and marks truncation", () => {
    const second = entry("Second", "A recursive detail.");
    const first = entry("First", `First knows Second. ${"Long canonical detail. ".repeat(200)}`);
    const references = discoverReferences({
      entries: [first, second],
      scanText: "Use First.",
      maxDepth: 2,
    });
    const formatted = formatCompendiumReferences(references, 180);
    expect(formatted).toContain("[Entry Name: First]");
    expect(formatted).toContain("[Reference Source: mentioned]");
    expect(formatted).toContain("[Truncated to fit the Compendium context budget]");
    expect(formatted).not.toContain("[Entry Name: Second]");
  });

  it("injects canonical context for a saved custom prompt that predates selected_context", () => {
    const savedCustomPrompt = prompt(
      [{ role: "user", content: "Direction: {{user_instructions}}" }],
      ["user_instructions"],
    );
    const messages = ideationPromptMessages(
      "ideation.premise",
      savedCustomPrompt,
      { user_instructions: "Make it tender." },
      "[Entry Name: Evelyn]\nCanonical fact.",
    );
    expect(messages[1]).toEqual(
      expect.objectContaining({ role: "developer", content: expect.stringContaining("Evelyn") }),
    );
    expect(messages.at(-1)?.content).toBe("Direction: Make it tender.");
  });

  it("uses selected_context in modern prompts without duplicating the fallback", () => {
    const modern = prompt(
      [
        {
          role: "user",
          content: "Reference: {{selected_context}}\nDirection: {{user_instructions}}",
        },
      ],
      ["selected_context", "user_instructions"],
    );
    const messages = ideationPromptMessages(
      "ideation.premise",
      modern,
      { user_instructions: "Be strange." },
      "Canonical context.",
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("Reference: Canonical context.");
    expect(messages[1]?.content).toContain("Direction: Be strange.");
  });

  it("rejects duplicate, missing, or foreign reference IDs", () => {
    const available = crypto.randomUUID();
    expect(hasInvalidIdeationReferenceIds([available], [available])).toBe(false);
    expect(hasInvalidIdeationReferenceIds([available, available], [available])).toBe(true);
    expect(hasInvalidIdeationReferenceIds([crypto.randomUUID()], [available])).toBe(true);
  });

  it("strictly parses premise extraction and rejects invalid categories", () => {
    const extraction = JSON.stringify({
      entries: [
        {
          name: "Mara",
          typeId: "story.character",
          description: "An investigator.",
          evidence: "Mara",
        },
      ],
    });
    expect(parseCompendiumExtraction(extraction).entries).toHaveLength(1);
    expect(parseCompendiumExtraction(`\`\`\`json\n${extraction}\n\`\`\``).entries).toHaveLength(1);
    expect(
      parseCompendiumExtraction(`<think>Internal reasoning.</think>\nResult:\n${extraction}`)
        .entries,
    ).toHaveLength(1);
    expect(() =>
      parseCompendiumExtraction(
        JSON.stringify({
          entries: [
            {
              name: "Mood",
              typeId: "project.themes",
              description: "Not an entity.",
              evidence: "mood",
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() => parseCompendiumExtraction("not json")).toThrow();
  });

  it("matches extracted names against existing names and aliases canonically", () => {
    const id = crypto.randomUUID();
    const names = indexCompendiumEntryNames([
      { id, name: "Mara Vale", aliases: ["The Investigator"], revision: 1 },
    ]);
    expect(names.get("mara vale")?.[0]?.id).toBe(id);
    expect(names.get("the investigator")?.[0]?.id).toBe(id);
  });

  it("appends extracted details on a new paragraph without replacing existing content", () => {
    expect(
      appendCompendiumContent({ kind: "text", text: "Existing details." }, "New details."),
    ).toEqual({ kind: "text", text: "Existing details.\n\nNew details." });

    expect(
      appendCompendiumContent(
        {
          kind: "rich_text",
          plainText: "Existing details.",
          document: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Existing details." }] },
            ],
          },
        },
        "New details.",
      ),
    ).toEqual({
      kind: "rich_text",
      plainText: "Existing details.\n\nNew details.",
      document: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Existing details." }] },
          { type: "paragraph", content: [{ type: "text", text: "New details." }] },
        ],
      },
    });
  });
});
