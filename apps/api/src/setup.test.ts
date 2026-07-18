import { describe, expect, it } from "vitest";
import { removeIngredientPackOnlyValues } from "./routes/setup.js";

describe("project ingredient pack cleanup", () => {
  it("removes unique values and preserves overlaps and unrelated values", () => {
    const values = [
      { definitionId: "unique", label: "Unique" },
      { definitionId: "shared", label: "Shared" },
      { definitionId: "manual", label: "Manual" },
      { definitionId: null, label: "Freeform" },
    ];
    expect(
      removeIngredientPackOnlyValues(values, new Set(["unique", "shared"]), new Set(["shared"])),
    ).toEqual(values.slice(1));
  });
});
