import type { Project } from "@asterism/contracts";

export type ProjectSortField = "date" | "name" | "series" | "author";
export type ProjectSortDirection = "ascending" | "descending";

function projectText(project: Project, field: "name" | "series" | "author"): string {
  if (field === "name") return typeof project.title === "string" ? project.title : "";
  const value = project.settings?.[field];
  return typeof value === "string" ? value : "";
}

function timestamp(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareText(left: string, right: string, direction: number): number {
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * direction;
}

export function filterAndSortProjects(
  projects: Project[],
  query: string,
  sortField: ProjectSortField,
  sortDirection: ProjectSortDirection,
): Project[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = projects.filter((project) =>
    [
      projectText(project, "name"),
      projectText(project, "author"),
      projectText(project, "series"),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const direction = sortDirection === "ascending" ? 1 : -1;
  return [...matches].sort((left, right) => {
    if (sortField === "date") {
      return (timestamp(left.updatedAt) - timestamp(right.updatedAt)) * direction;
    }
    const primary = compareText(
      projectText(left, sortField),
      projectText(right, sortField),
      direction,
    );
    if (primary !== 0) return primary;
    return compareText(projectText(left, "name"), projectText(right, "name"), direction);
  });
}
