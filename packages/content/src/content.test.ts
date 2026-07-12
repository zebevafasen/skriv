import { describe, expect, it } from "vitest";
import { basePackage, getBuiltinPrompt, outlinePresets, validateBuiltinContent } from "./index.js";

describe("base content package", () => {
  it("validates and contains every implemented workflow", () => {
    expect(validateBuiltinContent().id).toBe("asterism.base");
    expect(basePackage.genres).toHaveLength(35);
    expect(basePackage.themes).toHaveLength(41);
    expect(basePackage.tags).toHaveLength(806);
    expect(basePackage.genres.map((genre) => genre.id)).not.toContain("genre.cozy_fantasy");
    expect(basePackage.genres.map((genre) => genre.id)).not.toContain("genre.romantic_comedy");
    expect(basePackage.tags.map((tag) => tag.id)).not.toEqual(
      expect.arrayContaining(["tag.second_person", "tag.multiple_pov", "tag.tense"]),
    );
    const themeLabels = new Set(basePackage.themes.map((theme) => theme.label.toLocaleLowerCase()));
    expect(basePackage.tags.some((tag) => themeLabels.has(tag.label.toLocaleLowerCase()))).toBe(false);
    expect(basePackage.prompts).toHaveLength(11);
    expect(basePackage.tagPacks.map((pack) => pack.name)).toEqual([
      "Fantasy",
      "Science Fiction",
      "Romance",
      "Mystery",
      "Horror",
      "Historical",
      "Cozy",
      "Thriller",
      "Spacefaring",
      "Western",
      "Supernatural",
      "Solarpunk",
      "Literary",
      "Erotica",
      "Crime & Noir",
      "All",
    ]);
    expect(getBuiltinPrompt("prose.continue").ownership).toBe("builtin");
    expect(getBuiltinPrompt("prose.revise_selection").variables).toContain("selected_text");
    expect(getBuiltinPrompt("chat.respond").variables).toContain("project_context");
    expect(getBuiltinPrompt("ideation.entity").variables).toContain("selected_context");
  });

  it("ships stable beat-level outline presets", () => {
    const threeAct = outlinePresets.find((preset) => preset.id === "three-act");
    const saveTheCat = outlinePresets.find((preset) => preset.id === "save-the-cat");
    expect(threeAct?.acts).toHaveLength(3);
    expect(
      threeAct?.acts.flatMap((act) => act.chapters).flatMap((chapter) => chapter.scenes),
    ).toHaveLength(9);
    expect(saveTheCat?.acts).toHaveLength(3);
    expect(
      saveTheCat?.acts.flatMap((act) => act.chapters).flatMap((chapter) => chapter.scenes),
    ).toHaveLength(15);
    expect(saveTheCat?.acts[0]?.chapters[0]?.scenes[0]).toMatchObject({ title: "Opening Image" });
  });
});
