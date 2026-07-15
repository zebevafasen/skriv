import { describe, expect, it } from "vitest";
import { projectSettingsSchema, type Project } from "@skriv/contracts";
import { renderManuscriptExport, safeExportFilename } from "./exporter.js";

const project: Project = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "The Northern Light",
  settings: projectSettingsSchema.parse({ author: "A. Writer" }),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("manuscript exporter", () => {
  it("creates portable filenames", () => {
    expect(safeExportFilename("  A Story: Stars & Snow  ")).toBe("a-story-stars-snow");
    expect(safeExportFilename("***")).toBe("skriv-story");
  });

  it("projects rich text into Markdown without empty scenes", async () => {
    const result = await renderManuscriptExport(
      {
        project,
        manuscript: [
          {
            title: "Arrival",
            chapters: [
              {
                title: "Harbor",
                scenes: [
                  {
                    title: "Dark Water",
                    document: {
                      type: "doc",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "The lights vanished.",
                              marks: [{ type: "bold" }],
                            },
                          ],
                        },
                      ],
                    },
                  },
                  { title: "Empty", document: { type: "doc", content: [{ type: "paragraph" }] } },
                ],
              },
            ],
          },
        ],
      },
      {
        format: "markdown",
        titlePage: true,
        actHeadings: true,
        chapterHeadings: true,
        sceneHeadings: true,
        includeEmptyScenes: false,
      },
    );
    const markdown = new TextDecoder().decode(result.bytes);
    expect(markdown).toContain("# The Northern Light");
    expect(markdown).toContain("**The lights vanished.**");
    expect(markdown).not.toContain("Empty");
  });
});
