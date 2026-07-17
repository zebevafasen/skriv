import { describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  compendiumTypeIdSchema,
  createManuscriptItemInputSchema,
  createProjectInputSchema,
  createProjectNoteInputSchema,
  editorSettingsSchema,
  extractCompendiumResponseSchema,
  generationRequestSchema,
  manuscriptExportOptionsSchema,
  promptDefinitionSchema,
  projectSettingsSchema,
  projectUpdateTouchesModifiedAt,
  sceneMetadataSchema,
  selectionActionSchema,
  ingredientPackSchema,
  legacyProjectArchiveV4Schema,
  syncProjectIngredientPacksInputSchema,
  updateProjectNoteInputSchema,
  updateProjectInputSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("validates application themes from the shared catalog", () => {
    for (const theme of [
      "system",
      "light",
      "dark",
      "midnight",
      "ocean",
      "forest",
      "sepia",
      "parchment",
    ]) {
      expect(appSettingsSchema.safeParse({ theme }).success).toBe(true);
    }
    expect(appSettingsSchema.safeParse({ theme: "unknown" }).success).toBe(false);
  });

  it("provides a project-scoped default label pack", () => {
    const settings = projectSettingsSchema.parse({});
    expect(settings.labelPacks).toEqual([
      expect.objectContaining({ id: "user.default", name: "My Labels", ownership: "user" }),
    ]);
  });

  it("keeps partial project setting updates partial", () => {
    const update = updateProjectInputSchema.parse({
      settings: { coverDataUrl: null, coverArtworkSeed: "replacement" },
    });

    expect(update).toEqual({
      settings: { coverDataUrl: null, coverArtworkSeed: "replacement" },
    });
    expect(projectUpdateTouchesModifiedAt(update)).toBe(false);
    expect(
      projectUpdateTouchesModifiedAt(updateProjectInputSchema.parse({ settings: { author: "A" } })),
    ).toBe(true);
  });

  it("validates advanced project setup and export options", () => {
    expect(
      createProjectInputSchema.parse({
        title: "Story",
        outline: { kind: "preset", presetId: "three-act" },
      }),
    ).toMatchObject({ language: "General English", ingredientPackIds: [] });
    expect(
      createProjectInputSchema.safeParse({ title: "Old client", tagPackIds: ["pack.old"] }).success,
    ).toBe(false);
    expect(syncProjectIngredientPacksInputSchema.safeParse({ packIds: ["pack.old"] }).success).toBe(
      false,
    );
    expect(manuscriptExportOptionsSchema.parse({ format: "docx" })).toMatchObject({
      titlePage: true,
      includeEmptyScenes: false,
    });
    expect(compendiumTypeIdSchema.safeParse(`custom.${crypto.randomUUID()}`).success).toBe(true);
    expect(
      ingredientPackSchema.safeParse({
        id: "pack.fantasy",
        collectionId: "tag-collection.genre.fantasy",
        name: "Fantasy",
        ownership: "builtin",
        values: { genres: [], themes: [], tags: [] },
        createdAt: null,
        updatedAt: null,
      }).success,
    ).toBe(true);
  });

  it("keeps schema-v4 project archives importable without restoring runtime aliases", () => {
    const archive = legacyProjectArchiveV4Schema.parse({
      schemaVersion: 4,
      project: { title: "Imported story", settings: { notes: "Archived note" } },
      manuscript: [],
      compendium: [],
      notes: [],
      projectTagPacks: [
        {
          sourcePackId: "builtin.genre.fantasy",
          name: "Fantasy",
          ownership: "builtin",
          values: { genres: ["genre.fantasy"], themes: [], tags: [] },
        },
      ],
    });
    expect(archive.project.title).toBe("Imported story");
    expect(archive.projectTagPacks[0]).toMatchObject({
      sourcePackId: "builtin.genre.fantasy",
      name: "Fantasy",
    });
  });
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

  it("accepts first-Scene generation and validates extraction drafts", () => {
    expect(
      generationRequestSchema.safeParse({
        sceneId: crypto.randomUUID(),
        sceneVersion: 1,
        workflow: "prose.first_scene",
        cursorPosition: 0,
        manuscriptBeforeCursor: "",
        manuscriptAfterCursor: "",
        targetLength: 1_000,
        lengthUnit: "words",
      }).success,
    ).toBe(true);
    expect(
      extractCompendiumResponseSchema.safeParse({
        sourcePremiseRevision: 2,
        suggestions: [
          {
            id: crypto.randomUUID(),
            name: "Mara",
            typeId: "story.character",
            description: "An investigator.",
            evidence: "Mara",
            duplicateEntryId: null,
            duplicateEntryRevision: null,
          },
        ],
        model: "test/model",
        promptId: "builtin.ideation.compendium_extract.default",
      }).success,
    ).toBe(true);
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
      fontSize: 18,
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
