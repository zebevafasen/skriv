import { describe, expect, it } from "vitest";
import { generationRequestSchema, promptDefinitionSchema, sceneMetadataSchema } from "./index.js";

describe("shared contracts", () => {
  it("requires an event for toward-event generation", () => {
    const result = generationRequestSchema.safeParse({
      sceneId: crypto.randomUUID(),
      sceneVersion: 1,
      workflow: "prose.toward_event",
      cursorPosition: 0,
      manuscriptBeforeCursor: "",
      manuscriptAfterCursor: "",
      targetLength: 2,
      lengthUnit: "paragraphs",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an unlimited prose request", () => {
    const result = generationRequestSchema.safeParse({
      sceneId: crypto.randomUUID(),
      sceneVersion: 1,
      workflow: "prose.continue",
      cursorPosition: 0,
      manuscriptBeforeCursor: "",
      manuscriptAfterCursor: "",
      targetLength: null,
      lengthUnit: "words",
    });
    expect(result.success).toBe(true);
  });

  it("accepts immutable built-in prompt definitions", () => {
    const result = promptDefinitionSchema.safeParse({
      id: "builtin.prose.start.default",
      name: "Start Writing",
      workflow: "prose.start",
      version: 1,
      description: "Default",
      ownership: "builtin",
      ownerId: null,
      sourcePromptId: null,
      messages: [{ role: "user", content: "{{context_package}}" }],
      variables: ["context_package"],
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate Scene labels regardless of capitalization", () => {
    const result = sceneMetadataSchema.safeParse({
      labels: [
        { id: crypto.randomUUID(), text: "Foreshadowing", color: "amber" },
        { id: crypto.randomUUID(), text: "foreshadowing", color: "blue" },
      ],
    });
    expect(result.success).toBe(false);
  });
});
