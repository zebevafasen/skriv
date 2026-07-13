import { type ContentPackage, contentPackageSchema, type WorkflowKey } from "@asterism/contracts";
import genres from "./genres.json" with { type: "json" };
import packageMetadata from "./manifest.json" with { type: "json" };
import prompts from "./prompts.json" with { type: "json" };
import tagPacks from "./tag-packs.json" with { type: "json" };
import tags from "./tags.json" with { type: "json" };
import themes from "./themes.json" with { type: "json" };

const catalogKeys = ["genres", "themes", "tags"] as const;

function authoredPromptContent(content: string | readonly string[]): string {
  return typeof content === "string" ? content : content.join("\n");
}

const normalizedPrompts = prompts.map((prompt) => ({
  ...prompt,
  messages: prompt.messages.map((message) => ({
    ...message,
    content: authoredPromptContent(message.content),
  })),
}));

function validateContentReferences(content: ContentPackage): ContentPackage {
  const catalogIds = Object.fromEntries(
    catalogKeys.map((key) => [key, new Set(content[key].map((item) => item.id))]),
  ) as Record<(typeof catalogKeys)[number], Set<string>>;

  for (const key of catalogKeys) {
    if (catalogIds[key].size !== content[key].length) {
      throw new Error(`Duplicate ${key} definition id in ${content.id}.`);
    }
  }

  const themeLabels = new Set(content.themes.map((theme) => theme.label.toLocaleLowerCase()));
  const overlappingTag = content.tags.find((tag) => themeLabels.has(tag.label.toLocaleLowerCase()));
  if (overlappingTag) {
    throw new Error(`Theme/tag label overlap in ${content.id}: ${overlappingTag.label}.`);
  }

  const packIds = new Set<string>();
  for (const pack of content.tagPacks) {
    if (packIds.has(pack.id)) throw new Error(`Duplicate tag pack id in ${content.id}: ${pack.id}.`);
    packIds.add(pack.id);

    for (const key of catalogKeys) {
      const values = pack.values[key];
      if (new Set(values).size !== values.length) {
        throw new Error(`Duplicate ${key} reference in tag pack ${pack.id}.`);
      }
      for (const value of values) {
        if (!catalogIds[key].has(value)) {
          throw new Error(`Unknown ${key} reference in tag pack ${pack.id}: ${value}.`);
        }
      }
    }
  }

  return content;
}

export const basePackage: ContentPackage = validateContentReferences(contentPackageSchema.parse({
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
  prompts: normalizedPrompts,
}));

export function getBuiltinPrompt(workflow: WorkflowKey) {
  const prompt = basePackage.prompts.find((candidate) => candidate.workflow === workflow);
  if (!prompt) throw new Error(`No built-in prompt registered for ${workflow}.`);
  return prompt;
}

export function validateBuiltinContent(): ContentPackage {
  return validateContentReferences(contentPackageSchema.parse(basePackage));
}

export * from "./outline-presets.js";
