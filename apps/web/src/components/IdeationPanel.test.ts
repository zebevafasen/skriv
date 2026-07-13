import { describe, expect, it } from "vitest";
import { clearIngredientValues } from "./IdeationPanel.js";

describe("Ideation ingredient clearing", () => {
  const values = [
    { label: "Locked", locked: true },
    { label: "Open", locked: false },
  ];

  it("preserves locked values during a normal clear", () => {
    expect(clearIngredientValues(values)).toEqual([{ label: "Locked", locked: true }]);
  });

  it("can explicitly clear locked values too", () => {
    expect(clearIngredientValues(values, true)).toEqual([]);
  });
});
