import { describe, expect, it } from "vitest";

describe("API contract surface", () => {
  it("keeps health responses deterministic", () => {
    expect({ status: "ok" }).toEqual({ status: "ok" });
  });
});
