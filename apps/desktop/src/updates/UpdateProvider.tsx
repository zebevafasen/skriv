import { error as logError, info as logInfo, warn as logWarn } from "@tauri-apps/plugin-log";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { createContext, type ReactNode, useContext, useEffect, useSyncExternalStore } from "react";
import type { DesktopClient } from "../native/desktop-client.js";
import { DesktopUpdateService, type DownloadEvent, type UpdateAdapter } from "./update-service.js";

const UpdateContext = createContext<DesktopUpdateService | null>(null);

function writeLog(level: "info" | "warn" | "error", message: string) {
  const operation =
    level === "error" ? logError(message) : level === "warn" ? logWarn(message) : logInfo(message);
  void operation.catch(() => {
    if (level === "error") console.error(message);
    else if (level === "warn") console.warn(message);
    else console.info(message);
  });
}

export function createDesktopUpdateService(
  client: DesktopClient,
  flushPendingPersistence: () => Promise<void>,
): DesktopUpdateService {
  const adapter: UpdateAdapter = {
    async check(options) {
      const update = await check(options);
      if (!update) return null;
      return {
        version: update.version,
        currentVersion: update.currentVersion,
        body: update.body,
        download: (onEvent) => update.download((event) => onEvent(event as DownloadEvent)),
        install: () => update.install(),
      };
    },
    relaunch,
    log: writeLog,
  };
  const enabled = import.meta.env.PROD && import.meta.env.VITE_UPDATER_ENABLED === "true";
  return new DesktopUpdateService(enabled, adapter, async () => {
    writeLog("info", "Flushing pending editor persistence before update installation.");
    await flushPendingPersistence();
    writeLog("info", "Creating shutdown project backups before update installation.");
    await client.shutdown();
    writeLog("info", "Shutdown project backups completed before update installation.");
  });
}

function UpdateBanner() {
  const { state, download, installAndRelaunch } = useDesktopUpdate();
  if (state.status !== "available" && state.status !== "ready") return null;
  return (
    <aside className="desktop-update-banner" aria-live="polite">
      <span>
        Skriv {state.version} is {state.status === "ready" ? "ready to install" : "available"}.
      </span>
      {state.status === "available" ? (
        <button className="button primary" type="button" onClick={() => void download()}>
          Download update
        </button>
      ) : (
        <button
          className="button primary"
          type="button"
          onClick={() =>
            void installAndRelaunch(window.confirm("Install the update and restart Skriv now?"))
          }
        >
          Install and restart
        </button>
      )}
    </aside>
  );
}

export function DesktopUpdateProvider({
  service,
  children,
}: {
  service: DesktopUpdateService;
  children: ReactNode;
}) {
  useEffect(() => {
    if (service.getState().status === "disabled") return;
    const timer = window.setTimeout(() => void service.checkForUpdates(), 8_000);
    return () => window.clearTimeout(timer);
  }, [service]);
  return (
    <UpdateContext.Provider value={service}>
      <UpdateBanner />
      {children}
    </UpdateContext.Provider>
  );
}

export function useDesktopUpdate() {
  const service = useContext(UpdateContext);
  if (!service) throw new Error("useDesktopUpdate must be used inside DesktopUpdateProvider.");
  const state = useSyncExternalStore(service.subscribe, service.getState, service.getState);
  return {
    state,
    checkForUpdates: () => service.checkForUpdates(),
    download: () => service.download(),
    installAndRelaunch: (confirmed: boolean) => service.installAndRelaunch(confirmed),
  };
}
