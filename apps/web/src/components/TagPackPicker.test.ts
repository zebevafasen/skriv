import type { TagPack } from "@asterism/contracts";
import { describe, expect, it } from "vitest";
import { packMatchesSearch, togglePackSelection } from "./TagPackPicker.js";

const pack: TagPack = {
  id: "pack.dark",
  collectionId: "collection.fantasy",
  name: "Dark Fantasy",
  description: "Cursed magic and dangerous worlds.",
  ownership: "builtin",
  values: { genres: ["genre.dark"], themes: ["theme.corruption"], tags: ["tag.necromancy"] },
  createdAt: null,
  updatedAt: null,
};

describe("hierarchical tag-pack selection", () => {
  it("adds a partial collection and removes a fully selected collection", () => {
    expect(new Set(togglePackSelection(new Set(["one"]), ["one", "two"]))).toEqual(
      new Set(["one", "two"]),
    );
    expect(togglePackSelection(new Set(["one", "two", "outside"]), ["one", "two"])).toEqual([
      "outside",
    ]);
  });

  it("searches pack metadata, collection names, and definition labels", () => {
    const definitions = new Map([
      ["tag.necromancy", { id: "tag.necromancy", label: "Necromancy", kind: "tag" as const }],
    ]);
    expect(packMatchesSearch(pack, "Fantasy", "cursed", definitions)).toBe(true);
    expect(packMatchesSearch(pack, "Fantasy", "necromancy", definitions)).toBe(true);
    expect(packMatchesSearch(pack, "Fantasy", "science fiction", definitions)).toBe(false);
  });
});
