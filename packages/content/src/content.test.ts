import { describe, expect, it } from "vitest";
import { basePackage, getBuiltinPrompt, validateBuiltinContent } from "./index.js";

describe("base content package", () => {
  it("validates and contains every implemented workflow", () => {
    expect(validateBuiltinContent().id).toBe("asterism.base");
    expect(basePackage.prompts).toHaveLength(6);
    expect(getBuiltinPrompt("prose.continue").ownership).toBe("builtin");
  });
});
