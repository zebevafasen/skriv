import { AppError } from "@skriv/application";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpenText, Feather, Library, Settings, Sparkles } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { skriv } from "../api.js";
import { DialogProvider } from "./DialogProvider.js";

export function AppShell({ children }: { children: ReactNode }) {
  const appSettings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => skriv().settings.app(),
  });

  useEffect(() => {
    if (appSettings.data?.theme) {
      const theme = appSettings.data.theme;
      if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
    }
  }, [appSettings.data?.theme]);

  return (
    <DialogProvider>
      <div className="app-shell">
        <header className="topbar">
          <Link to="/" className="brand" aria-label="Skriv home">
            <span className="brand-mark">
              <Feather size={19} strokeWidth={1.8} />
            </span>
            <span>Skriv</span>
          </Link>
          <nav className="global-nav" aria-label="Primary navigation">
            <Link to="/" activeProps={{ className: "active" }}>
              <Library size={17} /> Projects
            </Link>
            <Link to="/prompts" activeProps={{ className: "active" }}>
              <BookOpenText size={17} /> Prompts
            </Link>
            <Link to="/settings" activeProps={{ className: "active" }}>
              <Settings size={17} /> Settings
            </Link>
          </nav>
        </header>
        <main>{children}</main>
      </div>
    </DialogProvider>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={28} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const credentialMissing = error instanceof AppError && error.code === "CREDENTIAL_ERROR";
  return (
    <div className="notice error">
      {error instanceof Error ? error.message : "Something went wrong."}
      {credentialMissing ? (
        <>
          {" "}
          <Link to="/settings">Open Settings</Link>
        </>
      ) : null}
    </div>
  );
}
