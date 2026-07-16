import { describe, expect, it, vi } from "vitest";
import {
  DesktopUpdateService,
  type DownloadEvent,
  type UpdateAdapter,
  type UpdateCandidate,
} from "./update-service.js";

function candidate(overrides: Partial<UpdateCandidate> = {}): UpdateCandidate {
  return {
    version: "0.1.4",
    currentVersion: "0.1.3",
    body: "Release notes",
    download: vi.fn(async (onEvent: (event: DownloadEvent) => void) => {
      onEvent({ event: "Started", data: { contentLength: 10 } });
      onEvent({ event: "Progress", data: { chunkLength: 10 } });
      onEvent({ event: "Finished", data: {} });
    }),
    install: vi.fn(async () => {}),
    ...overrides,
  };
}

function harness(update: UpdateCandidate | null = candidate(), enabled = true) {
  const adapter: UpdateAdapter = {
    check: vi.fn(async () => update),
    relaunch: vi.fn(async () => {}),
    log: vi.fn(),
  };
  const beforeInstall = vi.fn(async () => {});
  const service = new DesktopUpdateService(enabled, adapter, beforeInstall);
  return { service, adapter, beforeInstall, update };
}

describe("DesktopUpdateService", () => {
  it("stays disabled in development builds", async () => {
    const { service, adapter } = harness(candidate(), false);
    await service.checkForUpdates();
    expect(service.getState()).toEqual({ status: "disabled" });
    expect(adapter.check).not.toHaveBeenCalled();
  });

  it("reports that no update is available", async () => {
    const { service } = harness(null);
    await service.checkForUpdates();
    expect(service.getState().status).toBe("unavailable");
  });

  it("reports an available update without downloading it", async () => {
    const update = candidate();
    const { service } = harness(update);
    await service.checkForUpdates();
    expect(service.getState()).toMatchObject({ status: "available", version: "0.1.4" });
    expect(update.download).not.toHaveBeenCalled();
  });

  it("reports download progress and becomes ready", async () => {
    const { service } = harness();
    const states: string[] = [];
    service.subscribe(() => states.push(service.getState().status));
    await service.checkForUpdates();
    await service.download();
    expect(states).toContain("downloading");
    expect(service.getState()).toEqual({ status: "ready", version: "0.1.4" });
  });

  it("keeps a ready update when installation is cancelled", async () => {
    const { service, beforeInstall, update } = harness();
    await service.checkForUpdates();
    await service.download();
    expect(await service.installAndRelaunch(false)).toBe(false);
    expect(service.getState().status).toBe("ready");
    expect(beforeInstall).not.toHaveBeenCalled();
    expect(update?.install).not.toHaveBeenCalled();
  });

  it("keeps the application open after a download failure", async () => {
    const update = candidate({
      download: vi.fn(async () => {
        throw new Error("network unavailable");
      }),
    });
    const { service } = harness(update);
    await service.checkForUpdates();
    await service.download();
    expect(service.getState()).toEqual({ status: "failed", message: "network unavailable" });
  });

  it("does not install when persistence preparation fails", async () => {
    const update = candidate();
    const { service, beforeInstall, adapter } = harness(update);
    beforeInstall.mockRejectedValueOnce(new Error("save failed"));
    await service.checkForUpdates();
    await service.download();
    expect(await service.installAndRelaunch(true)).toBe(false);
    expect(update.install).not.toHaveBeenCalled();
    expect(adapter.relaunch).not.toHaveBeenCalled();
    expect(service.getState()).toEqual({ status: "failed", message: "save failed" });
  });

  it("installs and relaunches after persistence succeeds", async () => {
    const update = candidate();
    const { service, beforeInstall, adapter } = harness(update);
    await service.checkForUpdates();
    await service.download();
    expect(await service.installAndRelaunch(true)).toBe(true);
    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
    expect(adapter.relaunch).toHaveBeenCalledOnce();
  });

  it("rejects malformed metadata and ignores downgrades", async () => {
    const malformed = harness(candidate({ version: "not-semver" }));
    await malformed.service.checkForUpdates();
    expect(malformed.service.getState().status).toBe("failed");

    const invalidNumericPrerelease = harness(candidate({ version: "0.1.4-01" }));
    await invalidNumericPrerelease.service.checkForUpdates();
    expect(invalidNumericPrerelease.service.getState().status).toBe("failed");

    const downgrade = harness(candidate({ version: "0.1.2" }));
    await downgrade.service.checkForUpdates();
    expect(downgrade.service.getState().status).toBe("unavailable");
  });

  it("compares prereleases and build metadata using SemVer precedence", async () => {
    const prerelease = harness(
      candidate({ version: "0.1.4-beta.10", currentVersion: "0.1.4-beta.2" }),
    );
    await prerelease.service.checkForUpdates();
    expect(prerelease.service.getState().status).toBe("available");

    const buildMetadata = harness(candidate({ version: "0.1.4+windows.1" }));
    await buildMetadata.service.checkForUpdates();
    expect(buildMetadata.service.getState().status).toBe("available");
  });
});
