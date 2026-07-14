import { configureAsterismClient } from "@asterism/application";
import { createAsterismRouter } from "@asterism/ui";
import "@asterism/ui/styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthPage } from "./AuthPage.js";
import { createWebClient } from "./http-client.js";
import { WebSettingsPage } from "./WebSettingsPage.js";

configureAsterismClient(createWebClient());
const { queryClient, router } = createAsterismRouter({
  settingsComponent: WebSettingsPage,
  authenticationComponent: AuthPage,
});
const root = document.getElementById("root");
if (!root) throw new Error("Root element not found.");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
