import { getBuiltInApplicationTheme } from "@skriv/themes";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyApplicationThemeDefinition,
  applyApplicationThemeSelection,
  type ApplicationThemeEnvironment,
  watchApplicationThemeSelection,
} from "./application-theme.js";

function createMediaQuery(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList;

  return {
    mediaQuery,
    listenerCount: () => listeners.size,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

function environment(mediaQuery: MediaQueryList): ApplicationThemeEnvironment {
  return { document, matchMedia: () => mediaQuery };
}

beforeEach(() => {
  document.documentElement.style.cssText = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-resolved-theme");
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe("application theme controller", () => {
  it("applies a named theme to the document and browser chrome", () => {
    const media = createMediaQuery(false);
    const definition = applyApplicationThemeSelection("parchment", environment(media.mediaQuery));

    expect(definition.id).toBe("parchment");
    expect(document.documentElement.dataset.theme).toBe("parchment");
    expect(document.documentElement.dataset.resolvedTheme).toBe("parchment");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      definition.variables["--bg"],
    );
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      definition.variables["--bg"],
    );
  });

  it("removes variables that are absent from the next valid definition", () => {
    const dark = getBuiltInApplicationTheme("dark");
    applyApplicationThemeDefinition({
      ...dark,
      id: "custom-theme",
      variables: { ...dark.variables, "--custom-extra": "hotpink" },
    });
    expect(document.documentElement.style.getPropertyValue("--custom-extra")).toBe("hotpink");

    applyApplicationThemeDefinition(dark);
    expect(document.documentElement.style.getPropertyValue("--custom-extra")).toBe("");
  });

  it("watches OS changes only while system mode is active", () => {
    const media = createMediaQuery(false);
    const stop = watchApplicationThemeSelection("system", environment(media.mediaQuery));

    expect(media.listenerCount()).toBe(1);
    expect(document.documentElement.dataset.theme).toBe("system");
    expect(document.documentElement.dataset.resolvedTheme).toBe("light");

    media.setMatches(true);
    expect(document.documentElement.dataset.resolvedTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");

    stop();
    expect(media.listenerCount()).toBe(0);

    const stopNamed = watchApplicationThemeSelection("ocean", environment(media.mediaQuery));
    expect(media.listenerCount()).toBe(0);
    stopNamed();
  });
});
