import type { IngredientPack } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import {
  ingredientPackMatchesSearch,
  toggleIngredientPackSelection,
} from "./IngredientPackPicker.js";

const pack: IngredientPack = {
  id: "pack.dark",
  collectionId: "collection.fantasy",
  name: "Dark Fantasy",
  description: "Cursed magic and dangerous worlds.",
  ownership: "builtin",
  values: { genres: ["genre.dark"], themes: ["theme.corruption"], tags: ["tag.necromancy"] },
  createdAt: null,
  updatedAt: null,
};

describe("hierarchical ingredient pack selection", () => {
  it("adds a partial collection and removes a fully selected collection", () => {
    expect(new Set(toggleIngredientPackSelection(new Set(["one"]), ["one", "two"]))).toEqual(
      new Set(["one", "two"]),
    );
    expect(
      toggleIngredientPackSelection(new Set(["one", "two", "outside"]), ["one", "two"]),
    ).toEqual(["outside"]);
  });

  it("searches pack metadata, collection names, and definition labels", () => {
    const definitions = new Map([
      ["tag.necromancy", { id: "tag.necromancy", label: "Necromancy", kind: "tag" as const }],
    ]);
    expect(ingredientPackMatchesSearch(pack, "Fantasy", "cursed", definitions)).toBe(true);
    expect(ingredientPackMatchesSearch(pack, "Fantasy", "necromancy", definitions)).toBe(true);
    expect(ingredientPackMatchesSearch(pack, "Fantasy", "science fiction", definitions)).toBe(
      false,
    );
  });
});
