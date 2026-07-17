import { projectSettingsSchema, type ProjectArchiveV5 } from "@skriv/contracts";
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
    const archivedProject = project();
    archivedProject.project.settings.coverArtworkSeed = archivedProject.project.id;
    archivedProject.assets = [
      {
        path: "assets/cover.png",
        mime: "image/png",
        target: { kind: "cover" },
      },
    ];
    const cover = new Uint8Array([137, 80, 78, 71]);
    const bytes = await encodeProjectArchive(
      archivedProject,
      [{ path: "assets/cover.png", mime: "image/png", bytes: cover }],
      "test",
    );
    const decoded = await decodeProjectArchive(bytes);
    expect(decoded.project.project.title).toBe("Portable story");
    expect(decoded.project.project.settings.coverArtworkSeed).toBe(archivedProject.project.id);
    expect(decoded.project.assets).toEqual(archivedProject.assets);
    expect(decoded.assets).toEqual([{ path: "assets/cover.png", mime: "image/png", bytes: cover }]);
    expect(decoded.manifest.entries.map((entry) => entry.path)).toEqual([
      "project.json",
      "assets/cover.png",
    ]);
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
