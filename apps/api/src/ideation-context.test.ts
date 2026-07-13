import type { CompendiumEntry, PromptDefinition } from "@asterism/contracts";
import { discoverReferences } from "@asterism/core";
import { describe, expect, it } from "vitest";
import {
  formatIdeationContext,
  hasInvalidIdeationReferenceIds,
  ideationPromptMessages,
} from "./routes/ideation.js";

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
    ownerId: crypto.randomUUID(),
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
    const formatted = formatIdeationContext(references, 180);
    expect(formatted).toContain("[Entry Name: First]");
    expect(formatted).toContain("[Reference Source: mentioned]");
    expect(formatted).toContain("[Truncated to fit the Ideation context budget]");
    expect(formatted).not.toContain("[Entry Name: Second]");
  });

  it("injects canonical context for a legacy prompt without changing creative direction", () => {
    const legacy = prompt(
      [{ role: "user", content: "Direction: {{user_instructions}}" }],
      ["user_instructions"],
    );
    const messages = ideationPromptMessages(
      "ideation.premise",
      legacy,
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
});
