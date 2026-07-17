import { z } from "zod";
import rawCatalog from "./catalog.json" with { type: "json" };
import dark from "./palettes/dark.json" with { type: "json" };
import forest from "./palettes/forest.json" with { type: "json" };
import light from "./palettes/light.json" with { type: "json" };
import midnight from "./palettes/midnight.json" with { type: "json" };
import ocean from "./palettes/ocean.json" with { type: "json" };
import parchment from "./palettes/parchment.json" with { type: "json" };
import sepia from "./palettes/sepia.json" with { type: "json" };

const themeIdPattern = /^[a-z][a-z0-9-]*$/;
const cssVariablePattern = /^--[a-z0-9-]+$/;

const catalogSchema = z.object({
  system: z.object({
    label: z.string().trim().min(1),
    lightTheme: z.string().regex(themeIdPattern),
    darkTheme: z.string().regex(themeIdPattern),
  }),
  themes: z.record(
    z.string().regex(themeIdPattern),
    z.object({
      label: z.string().trim().min(1),
      order: z.number().int().nonnegative(),
    }),
  ),
});

catalogSchema.parse(rawCatalog);

export type NamedApplicationThemeId = keyof typeof rawCatalog.themes;
export type ApplicationThemeId = "system" | NamedApplicationThemeId;
export type ApplicationThemeOption = Readonly<{ id: ApplicationThemeId; label: string }>;

const rawPaletteSchema = z.object({
  colorScheme: z.enum(["light", "dark"]),
  variables: z.record(z.string().regex(cssVariablePattern), z.string().trim().min(1)),
});

const applicationThemeDefinitionBaseSchema = rawPaletteSchema.extend({
  id: z.string().regex(themeIdPattern),
  label: z.string().trim().min(1),
});

const rawPalettes = {
  light,
  dark,
  midnight,
  ocean,
  forest,
  sepia,
  parchment,
} satisfies Record<NamedApplicationThemeId, unknown>;

const namedThemeIds = Object.keys(rawCatalog.themes) as NamedApplicationThemeId[];
const catalogOrders = namedThemeIds.map((id) => rawCatalog.themes[id].order);
if (new Set(catalogOrders).size !== catalogOrders.length) {
  throw new Error("Application theme catalog orders must be unique.");
}

function parseBuiltInTheme(id: NamedApplicationThemeId) {
  return applicationThemeDefinitionBaseSchema.parse({
    id,
    label: rawCatalog.themes[id].label,
    ...rawPaletteSchema.parse(rawPalettes[id]),
  });
}

const parsedBuiltInThemes = Object.fromEntries(
  namedThemeIds.map((id) => [id, parseBuiltInTheme(id)]),
) as Record<NamedApplicationThemeId, z.infer<typeof applicationThemeDefinitionBaseSchema>>;

const baselineVariableNames = Object.keys(parsedBuiltInThemes.dark.variables).sort();
for (const id of namedThemeIds) {
  const variableNames = Object.keys(parsedBuiltInThemes[id].variables).sort();
  if (
    variableNames.length !== baselineVariableNames.length ||
    variableNames.some((name, index) => name !== baselineVariableNames[index])
  ) {
    throw new Error(`Built-in application theme ${id} does not define the canonical token set.`);
  }
}

export const applicationThemeVariableNames: readonly string[] =
  Object.freeze(baselineVariableNames);

export const applicationThemeDefinitionSchema = applicationThemeDefinitionBaseSchema.superRefine(
  (definition, context) => {
    for (const variableName of applicationThemeVariableNames) {
      if (!(variableName in definition.variables)) {
        context.addIssue({
          code: "custom",
          path: ["variables", variableName],
          message: `Missing required application theme variable ${variableName}.`,
        });
      }
    }
  },
);

export type ApplicationThemeDefinition = z.infer<typeof applicationThemeDefinitionSchema>;
export type BuiltInApplicationThemeDefinition = ApplicationThemeDefinition & {
  id: NamedApplicationThemeId;
};

export function parseApplicationThemeDefinition(input: unknown): ApplicationThemeDefinition {
  return applicationThemeDefinitionSchema.parse(input);
}

export const applicationThemeIds = ["system", ...namedThemeIds] as readonly [
  ApplicationThemeId,
  ...ApplicationThemeId[],
];

export const applicationThemeIdSchema: z.ZodType<ApplicationThemeId> = z.enum(applicationThemeIds);

export const applicationThemeOptions: readonly ApplicationThemeOption[] = Object.freeze([
  { id: "system", label: rawCatalog.system.label },
  ...namedThemeIds
    .slice()
    .sort((left, right) => rawCatalog.themes[left].order - rawCatalog.themes[right].order)
    .map((id) => ({ id, label: rawCatalog.themes[id].label })),
]);

export function getBuiltInApplicationTheme(
  id: NamedApplicationThemeId,
): BuiltInApplicationThemeDefinition {
  return parsedBuiltInThemes[id] as BuiltInApplicationThemeDefinition;
}

export function resolveApplicationTheme(
  id: ApplicationThemeId,
  prefersDark: boolean,
): BuiltInApplicationThemeDefinition {
  if (id !== "system") return getBuiltInApplicationTheme(id);
  const resolvedId = prefersDark ? rawCatalog.system.darkTheme : rawCatalog.system.lightTheme;
  if (!(resolvedId in parsedBuiltInThemes)) {
    throw new Error(`System application theme points to unknown theme ${resolvedId}.`);
  }
  const definition = getBuiltInApplicationTheme(resolvedId as NamedApplicationThemeId);
  const expectedColorScheme = prefersDark ? "dark" : "light";
  if (definition.colorScheme !== expectedColorScheme) {
    throw new Error(
      `System ${expectedColorScheme} theme must use color-scheme ${expectedColorScheme}.`,
    );
  }
  return definition;
}
