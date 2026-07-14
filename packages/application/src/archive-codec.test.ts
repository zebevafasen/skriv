import { projectSettingsSchema, type ProjectArchiveV5 } from "@asterism/contracts";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProjectArchive, encodeProjectArchive } from "./archive-codec.js";

function project(): ProjectArchiveV5 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 5,
    project: {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Portable story",
      settings: projectSettingsSchema.parse({}),
      createdAt: now,
      updatedAt: now,
    },
    manuscript: [],
    compendiumCategories: [],
    compendium: [],
    notes: [],
    projectIngredientPacks: [],
    chatThreads: [],
    assets: [],
  };
}

describe("portable schema-v5 archives", () => {
  it("round trips a checksummed project", async () => {
    const bytes = await encodeProjectArchive(project(), [], "test");
    const decoded = await decodeProjectArchive(bytes);
    expect(decoded.project.project.title).toBe("Portable story");
    expect(decoded.manifest.entries.map((entry) => entry.path)).toEqual(["project.json"]);
  });

  it("rejects traversal paths before extraction", async () => {
    const bytes = zipSync({ "../project.json": new TextEncoder().encode("{}") });
    await expect(decodeProjectArchive(bytes)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects content changed after manifest creation", async () => {
    const encoded = await encodeProjectArchive(project(), [], "test");
    const files = unzipSync(encoded);
    files["project.json"] = new TextEncoder().encode('{"schemaVersion":5}');
    await expect(decodeProjectArchive(zipSync(files))).rejects.toThrow(/checksum/i);
  });
});
