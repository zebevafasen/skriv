import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { useDesktopUpdate } from "./updates/UpdateProvider.js";

export function DesktopSettingsPage() {
  const [version, setVersion] = useState<string | null>(null);
  const { state, checkForUpdates, download, installAndRelaunch } = useDesktopUpdate();

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  return (
    <section className="settings-card">
      <div className="settings-heading">
        <h2>About Skriv</h2>
      </div>
      <div className="settings-note">
        <div>
          <strong>Version {version ?? "loading…"}</strong>
          <p>A private, offline-first workspace for planning and writing long-form fiction.</p>
        </div>
      </div>
      <div className="settings-note">
        <div>
          <strong>Secure updates</strong>
          {state.status === "disabled" ? (
            <p>Automatic update checks are disabled in development and ordinary local builds.</p>
          ) : state.status === "idle" ? (
            <p>Skriv checks the signed stable release channel after startup.</p>
          ) : state.status === "checking" ? (
            <p>Checking for updates…</p>
          ) : state.status === "unavailable" ? (
            <p>Skriv is up to date. Last checked {new Date(state.checkedAt).toLocaleString()}.</p>
          ) : state.status === "available" ? (
            <p>Version {state.version} is available. It will not download without your approval.</p>
          ) : state.status === "downloading" ? (
            <>
              <p>Downloading version {state.version}…</p>
              <progress
                className="desktop-update-progress"
                value={state.downloaded}
                max={state.total ?? undefined}
              />
            </>
          ) : state.status === "ready" ? (
            <p>Version {state.version} is downloaded and ready to install.</p>
          ) : (
            <p className="error-notice">Update failed: {state.message}</p>
          )}
        </div>
      </div>
      <div className="button-row">
        {state.status !== "disabled" && state.status !== "downloading" ? (
          <button
            className="button ghost"
            type="button"
            disabled={state.status === "checking"}
            onClick={() => void checkForUpdates()}
          >
            Check for updates
          </button>
        ) : null}
        {state.status === "available" ? (
          <button className="button primary" type="button" onClick={() => void download()}>
            Download version {state.version}
          </button>
        ) : null}
        {state.status === "ready" ? (
          <button
            className="button primary"
            type="button"
            onClick={() =>
              void installAndRelaunch(window.confirm("Install the update and restart Skriv now?"))
            }
          >
            Install and restart
          </button>
        ) : null}
      </div>
    </section>
  );
}
