import { configureAsterismClient } from "@asterism/application";
import { flushPendingPersistence, queryClient, router } from "@asterism/ui";
import "@asterism/ui/styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createDesktopClient } from "./native/desktop-client.js";

type DatabaseStatus = { ready: boolean; error: string | null };
type DatabaseSnapshot = { name: string; createdAt: string; size: number };

function RecoveryScreen({ error }: { error: string }) {
  const [snapshots, setSnapshots] = useState<DatabaseSnapshot[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    void invoke<DatabaseSnapshot[]>("list_database_snapshots")
      .then(setSnapshots)
      .catch((reason) => {
        setFailure(String(reason));
      });
  }, []);
  return (
    <main className="page settings-page">
      <section className="page-heading">
        <p className="eyebrow">Local recovery</p>
        <h1>Asterism could not open its database</h1>
        <p>
          Your existing database has not been replaced. Restore a safety snapshot, or open the
          backup folder to recover a portable project archive.
        </p>
      </section>
      <section className="settings-card">
        <p className="error-notice">{error}</p>
        <div className="button-row">
          <button
            className="button ghost"
            type="button"
            onClick={() => void invoke("open_backup_folder")}
          >
            Open backup folder
          </button>
        </div>
        <div className="snapshot-list">
          {snapshots.map((snapshot) => (
            <div key={snapshot.name}>
              <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
              <small>{(snapshot.size / 1024 / 1024).toFixed(1)} MiB</small>
              <button
                className="button danger"
                type="button"
                onClick={() =>
                  void invoke("restore_database_snapshot", {
                    request: { name: snapshot.name },
                  }).catch((reason) => setFailure(String(reason)))
                }
              >
                Restore and restart
              </button>
            </div>
          ))}
        </div>
        {failure ? <p className="error-notice">{failure}</p> : null}
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found.");
const reactRoot = createRoot(root);

async function start() {
  const status = await invoke<DatabaseStatus>("database_status");
  if (!status.ready) {
    reactRoot.render(<RecoveryScreen error={status.error ?? "Unknown database startup error."} />);
    return;
  }
  const client = createDesktopClient();
  configureAsterismClient(client);
  let closing = false;
  await getCurrentWindow().onCloseRequested(async (event) => {
    if (closing) return;
    event.preventDefault();
    closing = true;
    try {
      await flushPendingPersistence();
      await client.shutdown();
      await getCurrentWindow().destroy();
    } catch (error) {
      closing = false;
      console.error("Asterism could not finish saving before close.", error);
    }
  });
  reactRoot.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Asterism frontend startup failed.", error);
  reactRoot.render(<RecoveryScreen error={message} />);
});
