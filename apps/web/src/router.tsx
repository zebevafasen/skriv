import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppShell } from "./components/AppShell.js";

const AuthPage = lazy(() =>
  import("./pages/AuthPage.js").then((module) => ({ default: module.AuthPage })),
);
const LibraryPage = lazy(() =>
  import("./pages/LibraryPage.js").then((module) => ({ default: module.LibraryPage })),
);
const ProjectPage = lazy(() =>
  import("./pages/ProjectPage.js").then((module) => ({ default: module.ProjectPage })),
);
const PromptsPage = lazy(() =>
  import("./pages/PromptsPage.js").then((module) => ({ default: module.PromptsPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage.js").then((module) => ({ default: module.SettingsPage })),
);

type ProjectSearch = {
  tab?: "chat" | "compendium" | "ideation" | "settings";
  view?: "outline" | "notes";
  scope?: string;
  scene?: string;
  thread?: string;
  entry?: string;
};

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 }, mutations: { retry: 0 } },
});

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Suspense fallback={<div className="loading-state">Loading workspace…</div>}>
        <Outlet />
      </Suspense>
    </AppShell>
  ),
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryPage,
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  validateSearch: (search: Record<string, unknown>): ProjectSearch => ({
    ...(search.tab === "chat" ||
    search.tab === "compendium" ||
    search.tab === "ideation" ||
    search.tab === "settings"
      ? { tab: search.tab }
      : {}),
    ...(search.view === "outline" || search.view === "notes" ? { view: search.view } : {}),
    ...(typeof search.scope === "string" &&
    /^(story|(?:act|chapter|scene):[0-9a-f-]+)$/.test(search.scope)
      ? { scope: search.scope }
      : {}),
    ...(typeof search.scene === "string" ? { scene: search.scene } : {}),
    ...(typeof search.thread === "string" ? { thread: search.thread } : {}),
    ...(typeof search.entry === "string" ? { entry: search.entry } : {}),
  }),
  component: ProjectPage,
});
const promptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/prompts",
  component: PromptsPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});
const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: AuthPage,
});

const routeTree = rootRoute.addChildren([
  libraryRoute,
  projectRoute,
  promptsRoute,
  settingsRoute,
  authRoute,
]);
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
