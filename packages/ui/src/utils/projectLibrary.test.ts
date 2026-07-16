import { projectSchema } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import { filterAndSortProjects, type ProjectSortField } from "./projectLibrary.js";

const projects = [
  projectSchema.parse({
    id: "086d6a2d-37d3-4245-96cb-1f4e831c5593",
    title: "The Second Star",
    settings: { author: "Mira Vale", series: "Night Atlas" },
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
  }),
  projectSchema.parse({
    id: "97a6691c-0f9a-4f4f-9b7f-677f1976cf58",
    title: "Amber Roads",
    settings: { author: "Jon Bell", series: "Daybreak" },
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
  }),
  projectSchema.parse({
    id: "1bf5c836-e406-42c9-bfc3-b321a5bbc9d9",
    title: "Untethered",
    settings: { author: "", series: "" },
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
  }),
];

describe("project library filtering and sorting", () => {
  it.each([
    ["second", "The Second Star"],
    ["mira", "The Second Star"],
    ["night atlas", "The Second Star"],
  ])("searches title, author, and series for %s", (query, expectedTitle) => {
    expect(
      filterAndSortProjects(projects, query, "date", "descending").map((item) => item.title),
    ).toEqual([expectedTitle]);
  });

  it("sorts by last modified descending by default", () => {
    expect(
      filterAndSortProjects(projects, "", "date", "descending").map((item) => item.title),
    ).toEqual(["Amber Roads", "Untethered", "The Second Star"]);
  });

  it("sorts oldest-to-newest for ascending dates", () => {
    expect(
      filterAndSortProjects(projects, "", "date", "ascending").map((item) => item.title),
    ).toEqual(["The Second Star", "Untethered", "Amber Roads"]);
  });

  it.each<[ProjectSortField, string[]]>([
    ["name", ["Amber Roads", "The Second Star", "Untethered"]],
    ["series", ["Amber Roads", "The Second Star", "Untethered"]],
    ["author", ["Amber Roads", "The Second Star", "Untethered"]],
  ])("sorts ascending by %s and keeps missing metadata last", (field, expectedTitles) => {
    expect(
      filterAndSortProjects(projects, "", field, "ascending").map((item) => item.title),
    ).toEqual(expectedTitles);
  });

  it("reverses populated values without moving missing metadata to the front", () => {
    expect(
      filterAndSortProjects(projects, "", "author", "descending").map((item) => item.title),
    ).toEqual(["The Second Star", "Amber Roads", "Untethered"]);
  });

  it("sorts names Z-to-A for descending order", () => {
    expect(
      filterAndSortProjects(projects, "", "name", "descending").map((item) => item.title),
    ).toEqual(["Untethered", "The Second Star", "Amber Roads"]);
  });

  it("handles saved projects whose author or series metadata is absent", () => {
    const projectsWithoutOptionalMetadata = projects.map((project) => ({
      ...project,
      settings: { ...project.settings, author: undefined, series: undefined },
    })) as unknown as typeof projects;

    expect(
      filterAndSortProjects(projectsWithoutOptionalMetadata, "second", "series", "ascending").map(
        (item) => item.title,
      ),
    ).toEqual(["The Second Star"]);
    expect(
      filterAndSortProjects(projectsWithoutOptionalMetadata, "", "series", "ascending").map(
        (item) => item.title,
      ),
    ).toEqual(["Amber Roads", "The Second Star", "Untethered"]);
  });
});
