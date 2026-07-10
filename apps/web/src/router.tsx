import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppShell } from "./components/AppShell.js";
import { AuthPage } from "./pages/AuthPage.js";
import { LibraryPage } from "./pages/LibraryPage.js";
import { ProjectPage } from "./pages/ProjectPage.js";
import { PromptsPage } from "./pages/PromptsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 }, mutations: { retry: 0 } },
});

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
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
