import { type ContentPackage, contentPackageSchema, type WorkflowKey } from "@asterism/contracts";
import genres from "./genres.json" with { type: "json" };
import packageMetadata from "./manifest.json" with { type: "json" };
import prompts from "./prompts.json" with { type: "json" };
import tagPacks from "./tag-packs.json" with { type: "json" };
import tags from "./tags.json" with { type: "json" };
import themes from "./themes.json" with { type: "json" };

export const basePackage: ContentPackage = contentPackageSchema.parse({
  ...packageMetadata,
  genres,
  themes,
  tags,
  tagPacks: [
    ...tagPacks,
    {
      id: "pack.all",
      name: "All",
      description: "Contains all registered built-in genres, themes, and tags.",
      values: {
        genres: genres.map((g) => g.id),
        themes: themes.map((t) => t.id),
        tags: tags.map((t) => t.id),
      },
    },
  ],
  prompts,
});

export function getBuiltinPrompt(workflow: WorkflowKey) {
  const prompt = basePackage.prompts.find((candidate) => candidate.workflow === workflow);
  if (!prompt) throw new Error(`No built-in prompt registered for ${workflow}.`);
  return prompt;
}

export function validateBuiltinContent(): ContentPackage {
  return contentPackageSchema.parse(basePackage);
}

export * from "./outline-presets.js";
