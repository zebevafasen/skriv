import { describe, expect, it } from "vitest";
import { findLabelDefinition, projectLabelLibrary, safeLabelColor } from "./sceneLabelPacks.js";

describe("scene label packs", () => {
  it("always provides built-in packs and the default user pack", () => {
    const library = projectLabelLibrary(undefined);
    expect(library.builtinPacks.map((pack) => pack.name)).toEqual(["Status", "Time"]);
    expect(library.userPacks[0]?.id).toBe("user.default");
  });

  it("preserves unmatched legacy labels in My Labels", () => {
    const legacy = {
      id: crypto.randomUUID(),
      definitionId: null,
      text: "Foreshadowing",
      color: "amber" as const,
    };
    const library = projectLabelLibrary(undefined, [legacy]);
    const migrated = library.userPacks[0]?.labels[0];
    expect(migrated).toMatchObject({ name: "Foreshadowing", color: "orange" });
    expect(findLabelDefinition(library.allPacks, legacy)?.definition.name).toBe("Foreshadowing");
    expect(safeLabelColor("yellow")).toBe("orange");
  });

  it("recognizes matching legacy labels as built-in definitions", () => {
    const legacy = {
      id: crypto.randomUUID(),
      definitionId: null,
      text: "Draft",
      color: "slate" as const,
    };
    const library = projectLabelLibrary(undefined, [legacy]);
    expect(library.userPacks[0]?.labels).toEqual([]);
    expect(findLabelDefinition(library.allPacks, legacy)?.pack.id).toBe("builtin.status");
  });
});
