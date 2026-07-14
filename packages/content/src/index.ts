import { type ContentPackage, contentPackageSchema, type WorkflowKey } from "@asterism/contracts";
import genres from "./genres.json" with { type: "json" };
import packageMetadata from "./manifest.json" with { type: "json" };
import prompts from "./prompts.json" with { type: "json" };
import ingredientPackCategories from "./ingredient-pack-categories.json" with { type: "json" };
import ingredientPackCollections from "./ingredient-pack-collections.json" with { type: "json" };
import ingredientPacks from "./ingredient-packs.json" with { type: "json" };
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
  const categoryIds = new Set(content.ingredientPackCategories.map((category) => category.id));
  if (categoryIds.size !== content.ingredientPackCategories.length) {
    throw new Error(`Duplicate ingredient pack category id in ${content.id}.`);
  }
  const collectionIds = new Set<string>();
  for (const collection of content.ingredientPackCollections) {
    if (collectionIds.has(collection.id)) {
      throw new Error(
        `Duplicate ingredient pack collection id in ${content.id}: ${collection.id}.`,
      );
    }
    if (!categoryIds.has(collection.categoryId)) {
      throw new Error(`Unknown category for ingredient pack collection ${collection.id}.`);
    }
    collectionIds.add(collection.id);
  }
  for (const pack of content.ingredientPacks) {
    if (packIds.has(pack.id))
      throw new Error(`Duplicate ingredient pack id in ${content.id}: ${pack.id}.`);
    packIds.add(pack.id);
    if (!collectionIds.has(pack.collectionId)) {
      throw new Error(`Unknown collection for ingredient pack ${pack.id}: ${pack.collectionId}.`);
    }

    for (const key of catalogKeys) {
      const values = pack.values[key];
      if (new Set(values).size !== values.length) {
        throw new Error(`Duplicate ${key} reference in ingredient pack ${pack.id}.`);
      }
      for (const value of values) {
        if (!catalogIds[key].has(value)) {
          throw new Error(`Unknown ${key} reference in ingredient pack ${pack.id}: ${value}.`);
        }
      }
    }
  }

  return content;
}

export const basePackage: ContentPackage = validateContentReferences(
  contentPackageSchema.parse({
    ...packageMetadata,
    genres,
    themes,
    tags,
    ingredientPackCategories,
    ingredientPackCollections,
    ingredientPacks,
    prompts: normalizedPrompts,
  }),
);

export function getBuiltinPrompt(workflow: WorkflowKey) {
  const prompt = basePackage.prompts.find((candidate) => candidate.workflow === workflow);
  if (!prompt) throw new Error(`No built-in prompt registered for ${workflow}.`);
  return prompt;
}

export function validateBuiltinContent(): ContentPackage {
  return validateContentReferences(contentPackageSchema.parse(basePackage));
}

export * from "./outline-presets.js";
