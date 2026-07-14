import { AppError } from "@asterism/application";
import { Link } from "@tanstack/react-router";
import { BookOpenText, Library, Settings, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { DialogProvider } from "./DialogProvider.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DialogProvider>
      <div className="app-shell">
        <header className="topbar">
          <Link to="/" className="brand" aria-label="Asterism home">
            <span className="brand-mark">
              <Sparkles size={18} />
            </span>
            <span>Asterism</span>
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
          <div className="profile-dot" title="Local Writer">
            LW
          </div>
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
