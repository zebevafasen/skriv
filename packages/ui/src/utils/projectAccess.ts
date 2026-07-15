const projectAccessKey = "skriv:library:project-access";

export type ProjectAccessHistory = Record<string, string>;

export function readProjectAccessHistory(): ProjectAccessHistory {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(projectAccessKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          typeof entry[1] === "string" &&
          !Number.isNaN(Date.parse(entry[1])),
      ),
    );
  } catch {
    return {};
  }
}

export function recordProjectAccess(projectId: string, openedAt = new Date()): void {
  if (typeof window === "undefined") return;
  const history = readProjectAccessHistory();
  history[projectId] = openedAt.toISOString();
  localStorage.setItem(projectAccessKey, JSON.stringify(history));
}
