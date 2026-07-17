import { describe, expect, it } from "vitest";
import {
  applicationThemeDefinitionSchema,
  applicationThemeIds,
  applicationThemeOptions,
  applicationThemeVariableNames,
  getBuiltInApplicationTheme,
  resolveApplicationTheme,
} from "./index.js";

describe("application theme catalog", () => {
  it("keeps every built-in theme ordered and backed by a complete palette", () => {
    expect(applicationThemeOptions.map((option) => option.id)).toEqual([
      "system",
      "light",
      "dark",
      "midnight",
      "ocean",
      "forest",
      "sepia",
      "parchment",
    ]);
    expect(applicationThemeIds).toHaveLength(applicationThemeOptions.length);

    for (const option of applicationThemeOptions.slice(1)) {
      const definition = getBuiltInApplicationTheme(
        option.id as Exclude<typeof option.id, "system">,
      );
      expect(definition.label).toBe(option.label);
      expect(Object.keys(definition.variables).sort()).toEqual(applicationThemeVariableNames);
    }
  });

  it("resolves system mode to the matching light or dark palette", () => {
    expect(resolveApplicationTheme("system", false)).toMatchObject({
      id: "light",
      colorScheme: "light",
    });
    expect(resolveApplicationTheme("system", true)).toMatchObject({
      id: "dark",
      colorScheme: "dark",
    });
  });

  it("requires custom definitions to supply the complete built-in token set", () => {
    const dark = getBuiltInApplicationTheme("dark");
    expect(
      applicationThemeDefinitionSchema.safeParse({ ...dark, id: "custom-theme" }).success,
    ).toBe(true);
    expect(
      applicationThemeDefinitionSchema.safeParse({
        ...dark,
        id: "custom-theme",
        variables: { "--bg": "#000" },
      }).success,
    ).toBe(false);
  });
});
