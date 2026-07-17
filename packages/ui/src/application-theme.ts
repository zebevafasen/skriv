import {
  type ApplicationThemeDefinition,
  type ApplicationThemeId,
  parseApplicationThemeDefinition,
  resolveApplicationTheme,
} from "@skriv/themes";

const colorSchemeQuery = "(prefers-color-scheme: dark)";
const appliedVariables = new WeakMap<HTMLElement, ReadonlySet<string>>();

export type ApplicationThemeEnvironment = Readonly<{
  document: Document;
  matchMedia: (query: string) => MediaQueryList;
}>;

export type ApplicationThemeApplicationOptions = Readonly<{
  document?: Document;
  selectedThemeId?: string;
}>;

function browserEnvironment(): ApplicationThemeEnvironment {
  return {
    document,
    matchMedia: (query) => window.matchMedia(query),
  };
}

function updateThemeColor(documentTarget: Document, color: string): void {
  let meta = documentTarget.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = documentTarget.createElement("meta");
    meta.name = "theme-color";
    documentTarget.head.append(meta);
  }
  meta.content = color;
}

export function applyApplicationThemeDefinition(
  input: unknown,
  options: ApplicationThemeApplicationOptions = {},
): ApplicationThemeDefinition {
  const definition = parseApplicationThemeDefinition(input);
  const documentTarget = options.document ?? document;
  const root = documentTarget.documentElement;
  const nextVariableNames = new Set(Object.keys(definition.variables));

  for (const variableName of appliedVariables.get(root) ?? []) {
    if (!nextVariableNames.has(variableName)) root.style.removeProperty(variableName);
  }
  for (const [variableName, value] of Object.entries(definition.variables)) {
    root.style.setProperty(variableName, value);
  }

  appliedVariables.set(root, nextVariableNames);
  root.style.setProperty("color-scheme", definition.colorScheme);
  root.dataset.theme = options.selectedThemeId ?? definition.id;
  root.dataset.resolvedTheme = definition.id;

  const background = definition.variables["--bg"];
  if (background) updateThemeColor(documentTarget, background);
  return definition;
}

export function applyApplicationThemeSelection(
  id: ApplicationThemeId,
  environment: ApplicationThemeEnvironment = browserEnvironment(),
): ApplicationThemeDefinition {
  const prefersDark = environment.matchMedia(colorSchemeQuery).matches;
  const definition = resolveApplicationTheme(id, prefersDark);
  return applyApplicationThemeDefinition(definition, {
    document: environment.document,
    selectedThemeId: id,
  });
}

export function watchApplicationThemeSelection(
  id: ApplicationThemeId,
  environment: ApplicationThemeEnvironment = browserEnvironment(),
): () => void {
  const mediaQuery = environment.matchMedia(colorSchemeQuery);
  const applyResolvedTheme = (prefersDark: boolean) => {
    applyApplicationThemeDefinition(resolveApplicationTheme(id, prefersDark), {
      document: environment.document,
      selectedThemeId: id,
    });
  };

  applyResolvedTheme(mediaQuery.matches);
  if (id !== "system") return () => undefined;

  const handleChange = (event: MediaQueryListEvent) => applyResolvedTheme(event.matches);
  mediaQuery.addEventListener("change", handleChange);
  return () => mediaQuery.removeEventListener("change", handleChange);
}

export function initializeApplicationTheme(
  environment: ApplicationThemeEnvironment = browserEnvironment(),
): ApplicationThemeDefinition {
  return applyApplicationThemeSelection("system", environment);
}
