import { describe, expect, it } from "vitest";
import {
  createManuscriptItemInputSchema,
  createProjectNoteInputSchema,
  editorSettingsSchema,
  generationRequestSchema,
  promptDefinitionSchema,
  sceneMetadataSchema,
  selectionActionSchema,
  updateProjectNoteInputSchema,
} from "./index.js";

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

  it("validates every selection revision action", () => {
    for (const selectionAction of selectionActionSchema.options) {
      const result = generationRequestSchema.safeParse({
        sceneId: crypto.randomUUID(),
        sceneVersion: 1,
        workflow: "prose.revise_selection",
        selectionAction,
        selectedText: "The rain crossed the glass.",
        cursorPosition: 5,
        manuscriptBeforeCursor: "Before.",
        manuscriptAfterCursor: "After.",
        instructions: selectionAction === "custom" ? "Make it ominous." : "",
        targetLength: 6,
        lengthUnit: "words",
      });
      expect(result.success).toBe(true);
    }
  });

  it("requires instructions for custom selection revisions", () => {
    const result = generationRequestSchema.safeParse({
      sceneId: crypto.randomUUID(),
      sceneVersion: 1,
      workflow: "prose.revise_selection",
      selectionAction: "custom",
      selectedText: "A sentence.",
      cursorPosition: 0,
      manuscriptBeforeCursor: "",
      manuscriptAfterCursor: "",
      targetLength: null,
      lengthUnit: "words",
    });
    expect(result.success).toBe(false);
  });

  it("provides bounded editor typography defaults", () => {
    expect(editorSettingsSchema.parse({})).toEqual({
      fontFamily: "literary",
      fontSize: 20,
      lineHeight: 1.85,
      paragraphSpacing: 1.15,
      firstLineIndent: 0,
      pageWidth: 920,
      textAlign: "left",
    });
    expect(editorSettingsSchema.safeParse({ fontSize: 17 }).success).toBe(false);
  });

  it("provides safe project-note defaults and paired document updates", () => {
    expect(createProjectNoteInputSchema.parse({})).toMatchObject({
      title: "Untitled Note",
      plainText: "",
      pinned: false,
    });
    expect(
      updateProjectNoteInputSchema.safeParse({
        expectedVersion: 1,
        document: { type: "doc", content: [{ type: "paragraph" }] },
      }).success,
    ).toBe(false);
  });

  it("validates atomic manuscript structure requests", () => {
    expect(
      createManuscriptItemInputSchema.safeParse({
        kind: "scene",
        chapterId: crypto.randomUUID(),
        afterSceneId: null,
      }).success,
    ).toBe(true);
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
