import { QueryClient } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { lazy, Suspense, type FunctionComponent } from "react";
import { AppShell } from "./components/AppShell.js";
import { DialogProvider } from "./components/DialogProvider.js";
import { SettingsProvider } from "./components/SettingsProvider.js";

const LibraryPage = lazy(() =>
  import("./pages/LibraryPage.js").then((module) => ({ default: module.LibraryPage })),
);
const ProjectPage = lazy(() =>
  import("./pages/ProjectPage.js").then((module) => ({ default: module.ProjectPage })),
);

type ProjectSearch = {
  tab?: "chat" | "compendium" | "ideation" | "settings";
  view?: "outline" | "notes";
  scope?: string;
  scene?: string;
  thread?: string;
  entry?: string;
};

export type SkrivRouterOptions = {
  settingsComponent?: FunctionComponent | undefined;
  authenticationComponent?: FunctionComponent | undefined;
};

export function createSkrivRouter(options: SkrivRouterOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 }, mutations: { retry: 0 } },
  });
  const RootComponent = () => {
    const location = useLocation();
    const content = (
      <DialogProvider>
        <SettingsProvider settingsComponent={options.settingsComponent}>
          {location.pathname !== "/login" ? (
            <AppShell>
              <Suspense fallback={<div className="loading-state">Loading workspace…</div>}>
                <Outlet />
              </Suspense>
            </AppShell>
          ) : (
            <Suspense fallback={<div className="loading-state">Loading workspace…</div>}>
              <Outlet />
            </Suspense>
          )}
        </SettingsProvider>
      </DialogProvider>
    );
    return content;
  };
  const rootRoute = createRootRoute({
    component: RootComponent,
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

  const authenticationRoute = options.authenticationComponent
    ? createRoute({
        getParentRoute: () => rootRoute,
        path: "/login",
        component: options.authenticationComponent,
      })
    : null;
  const routeTree = authenticationRoute
    ? rootRoute.addChildren([libraryRoute, projectRoute, authenticationRoute])
    : rootRoute.addChildren([libraryRoute, projectRoute]);
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    context: { queryClient },
  });
  return { queryClient, router };
}

export type SkrivRouter = ReturnType<typeof createSkrivRouter>["router"];
