import { builtinLabelPacks } from "@asterism/content/label-packs";
import {
  defaultUserLabelPack,
  type SceneLabel,
  type SceneLabelColor,
  type SceneLabelDefinition,
  type SceneLabelPack,
} from "@asterism/contracts";

export const editableLabelColors: SceneLabelColor[] = [
  "orange",
  "red",
  "rose",
  "pink",
  "violet",
  "purple",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "stone",
  "slate",
];

export function safeLabelColor(color: SceneLabelColor): SceneLabelColor {
  return color === "amber" || color === "yellow" ? "orange" : color;
}

function legacyDefinitionId(text: string): string {
  let hash = 2166136261;
  for (const character of text.toLocaleLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `legacy.${(hash >>> 0).toString(36)}`;
}

export function projectLabelLibrary(
  configuredPacks: SceneLabelPack[] | undefined,
  legacyLabels: SceneLabel[] = [],
): { builtinPacks: SceneLabelPack[]; userPacks: SceneLabelPack[]; allPacks: SceneLabelPack[] } {
  const userPacks = (configuredPacks ?? [])
    .filter((pack) => pack.ownership === "user")
    .map((pack) => ({ ...pack, labels: pack.labels.map((label) => ({ ...label })) }));
  let defaultPack = userPacks.find((pack) => pack.id === defaultUserLabelPack.id);
  if (!defaultPack) {
    defaultPack = { ...defaultUserLabelPack, labels: [] };
    userPacks.unshift(defaultPack);
  }

  const knownNames = new Set(
    [...builtinLabelPacks, ...userPacks]
      .flatMap((pack) => pack.labels)
      .map((label) => label.name.toLocaleLowerCase()),
  );
  for (const legacy of legacyLabels) {
    const normalized = legacy.text.toLocaleLowerCase();
    if (knownNames.has(normalized)) continue;
    defaultPack.labels.push({
      id: legacyDefinitionId(legacy.text),
      name: legacy.text,
      color: safeLabelColor(legacy.color),
    });
    knownNames.add(normalized);
  }

  const builtinPacks = builtinLabelPacks.map((pack) => ({
    ...pack,
    labels: pack.labels.map((label) => ({ ...label })),
  }));
  return { builtinPacks, userPacks, allPacks: [...builtinPacks, ...userPacks] };
}

export function findLabelDefinition(
  packs: SceneLabelPack[],
  label: SceneLabel,
): { pack: SceneLabelPack; definition: SceneLabelDefinition } | null {
  for (const pack of packs) {
    const definition = label.definitionId
      ? pack.labels.find((candidate) => candidate.id === label.definitionId)
      : pack.labels.find(
          (candidate) => candidate.name.toLocaleLowerCase() === label.text.toLocaleLowerCase(),
        );
    if (definition) return { pack, definition };
  }
  return null;
}
