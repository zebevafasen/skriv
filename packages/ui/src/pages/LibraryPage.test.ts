import { projectSettingsSchema } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import {
  projectArtworkHue,
  projectArtworkSecondaryHue,
  projectArtworkSeed,
  projectArtworkVariant,
  projectArtworkVariants,
} from "../utils/projectArtwork.js";

describe("project artwork", () => {
  it("is stable and remains within the available variants", () => {
    const id = "1c03c58d-9df3-4fe7-bd3c-7cb8ed13f510";
    expect(
      projectArtworkSeed({ id, settings: projectSettingsSchema.parse({}) }),
    ).toBe(id);
    expect(projectArtworkVariant(id)).toBe(projectArtworkVariant(id));
    expect(projectArtworkVariant(id)).toBeGreaterThanOrEqual(0);
    expect(projectArtworkVariant(id)).toBeLessThan(projectArtworkVariants.length);
  });

  it("uses the archived artwork seed after an import assigns a new project id", () => {
    const seed = "1c03c58d-9df3-4fe7-bd3c-7cb8ed13f510";
    const original = {
      id: seed,
      settings: projectSettingsSchema.parse({ coverArtworkSeed: seed }),
    };
    const imported = {
      id: "3fb99bf3-d363-4214-bb30-a415a50d25e9",
      settings: projectSettingsSchema.parse({ coverArtworkSeed: seed }),
    };

    expect(projectArtworkSeed(imported)).toBe(projectArtworkSeed(original));
    expect(projectArtworkVariant(projectArtworkSeed(imported))).toBe(
      projectArtworkVariant(projectArtworkSeed(original)),
    );
    expect(projectArtworkHue(projectArtworkSeed(imported))).toBe(
      projectArtworkHue(projectArtworkSeed(original)),
    );
    expect(projectArtworkSecondaryHue(projectArtworkSeed(imported))).toBe(
      projectArtworkSecondaryHue(projectArtworkSeed(original)),
    );
  });
});
