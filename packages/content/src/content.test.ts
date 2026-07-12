import { describe, expect, it } from "vitest";
import { basePackage, getBuiltinPrompt, validateBuiltinContent } from "./index.js";

describe("base content package", () => {
  it("validates and contains every implemented workflow", () => {
    expect(validateBuiltinContent().id).toBe("asterism.base");
    expect(basePackage.prompts).toHaveLength(10);
    expect(getBuiltinPrompt("prose.continue").ownership).toBe("builtin");
    expect(getBuiltinPrompt("prose.revise_selection").variables).toContain("selected_text");
    expect(getBuiltinPrompt("chat.respond").variables).toContain("project_context");
  });
});
