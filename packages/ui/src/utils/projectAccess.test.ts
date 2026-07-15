import { beforeEach, describe, expect, it, vi } from "vitest";
import { readProjectAccessHistory, recordProjectAccess } from "./projectAccess.js";

describe("project access history", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("records project opens independently and preserves their timestamps", () => {
    recordProjectAccess("project-one", new Date("2026-07-14T10:00:00.000Z"));
    recordProjectAccess("project-two", new Date("2026-07-15T11:30:00.000Z"));

    expect(readProjectAccessHistory()).toEqual({
      "project-one": "2026-07-14T10:00:00.000Z",
      "project-two": "2026-07-15T11:30:00.000Z",
    });
  });

  it("replaces a project's timestamp when it is opened again", () => {
    recordProjectAccess("project-one", new Date("2026-07-14T10:00:00.000Z"));
    recordProjectAccess("project-one", new Date("2026-07-15T11:30:00.000Z"));

    expect(readProjectAccessHistory()).toEqual({
      "project-one": "2026-07-15T11:30:00.000Z",
    });
  });

  it("ignores malformed stored history", () => {
    localStorage.setItem("asterism:library:project-access", "not json");
    expect(readProjectAccessHistory()).toEqual({});

    localStorage.setItem(
      "asterism:library:project-access",
      JSON.stringify({ valid: "2026-07-15T11:30:00.000Z", invalid: 42, badDate: "yesterday" }),
    );
    expect(readProjectAccessHistory()).toEqual({ valid: "2026-07-15T11:30:00.000Z" });
  });
});
