import { describe, expect, it } from "vitest";
import { projectArtworkVariant } from "./LibraryPage.js";

describe("project artwork", () => {
  it("is stable and remains within the available variants", () => {
    const id = "1c03c58d-9df3-4fe7-bd3c-7cb8ed13f510";
    expect(projectArtworkVariant(id)).toBe(projectArtworkVariant(id));
    expect(projectArtworkVariant(id)).toBeGreaterThanOrEqual(0);
    expect(projectArtworkVariant(id)).toBeLessThan(9);
  });
});
