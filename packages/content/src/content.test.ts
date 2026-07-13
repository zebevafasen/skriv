import { describe, expect, it } from "vitest";
import { basePackage, getBuiltinPrompt, outlinePresets, validateBuiltinContent } from "./index.js";
import authoredPrompts from "./prompts.json" with { type: "json" };

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
    expect(basePackage.schemaVersion).toBe(2);
    expect(basePackage.contentVersion).toBe(10);
    expect(basePackage.tagPackCategories.map((category) => category.name)).toEqual([
      "Genres",
      "Themes",
    ]);
    expect(basePackage.tagPackCollections).toHaveLength(18);
    expect(basePackage.tagPacks).toHaveLength(63);
    expect(basePackage.tagPacks.map((pack) => pack.name)).toEqual(
      "Epic Fantasy|Dark Fantasy|Sword & Sorcery|Urban Fantasy|Fairy Tales & Fables|Wuxia & Xianxia|Space Opera|Cyberpunk & Dystopian|Solarpunk|First Contact|Time & Alternate Realities|Contemporary Romance|Historical Romance|Paranormal Romance|Romantic Comedy|Classic Mystery|Cozy Mystery|Crime & Noir|Police Procedural|Heist & Caper|Gothic Horror|Psychological Horror|Folk Horror|Cosmic Horror|Hauntings & Occult|Monsters & Body Horror|Historical Drama|Historical Adventure|Alternate History|Western & Frontier|Literary Fiction|Slice of Life|Family & Social Drama|Satire|Action Thriller|Survival Adventure|Political Thriller|Superhero Adventure|Cozy Fantasy|Small-Town Comfort|Contemporary Erotica|Historical Erotica|Speculative Erotica|Consuming Ambition|Possessive Love|Pursuit of Perfection|Personal Vengeance|Cycles of Retaliation|Revenge vs Justice|Self-Discovery|Found Family|Exile & Displacement|Corruption & Complicity|Class & Prejudice|Freedom vs Duty|Love & Sacrifice|Betrayal & Reconciliation|Survival & Trauma|Redemption & Rebirth|Secrets & Truth|Memory & Legacy|Stewardship & Community|Technology & Humanity".split("|"),
    );
    expect(basePackage.tagPacks.some((pack) => pack.id === "pack.all")).toBe(false);
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

  it("authors prompt messages as readable lines and normalizes them without changing content", () => {
    for (const [promptIndex, prompt] of authoredPrompts.entries()) {
      for (const [messageIndex, message] of prompt.messages.entries()) {
        expect(Array.isArray(message.content)).toBe(true);
        expect(basePackage.prompts[promptIndex]?.messages[messageIndex]?.content).toBe(
          message.content.join("\n"),
        );
      }
    }
  });
});
