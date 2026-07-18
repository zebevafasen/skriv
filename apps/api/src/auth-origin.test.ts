import type { ServerEnv } from "@skriv/config";
import { describe, expect, it } from "vitest";
import { trustedAuthOrigins } from "./auth.js";

function origins(overrides: Partial<ServerEnv> = {}) {
  return trustedAuthOrigins({
    WEB_ORIGIN: "https://skriv-staging.vercel.app",
    BETTER_AUTH_URL: "https://skriv-staging.vercel.app",
    VERCEL_URL: undefined,
    VERCEL_BRANCH_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    ...overrides,
  });
}

describe("trustedAuthOrigins", () => {
  it("trusts the canonical origin and exact Vercel deployment origins", () => {
    expect(
      origins({
        VERCEL_URL: "skriv-abc123-zebevafasens-projects.vercel.app",
        VERCEL_BRANCH_URL: "https://skriv-git-main-zebevafasens-projects.vercel.app",
      }),
    ).toEqual([
      "https://skriv-staging.vercel.app",
      "https://skriv-abc123-zebevafasens-projects.vercel.app",
      "https://skriv-git-main-zebevafasens-projects.vercel.app",
    ]);
  });

  it("does not trust non-Vercel hosts supplied through deployment variables", () => {
    expect(origins({ VERCEL_URL: "attacker.example.com" })).toEqual([
      "https://skriv-staging.vercel.app",
    ]);
  });
});
