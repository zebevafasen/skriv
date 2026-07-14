import { describe, expect, it } from "vitest";
import { createAsterismClient, type PlatformCapabilities } from "./client.js";

const platforms: PlatformCapabilities[] = [
  { platform: "web", accounts: true, invitations: true, localBackups: false, nativeFileDialogs: false },
  { platform: "desktop", accounts: false, invitations: false, localBackups: true, nativeFileDialogs: true },
];

describe.each(platforms)("AsterismClient $platform conformance", (capabilities) => {
  it("routes domain methods through the same typed operation surface", async () => {
    const operations: string[] = [];
    const client = createAsterismClient(
      {
        async request(path, init) {
          operations.push(`${init?.method ?? "GET"} ${path}`);
          return [] as never;
        },
      },
      { generation: async () => undefined, chat: async () => undefined },
      { exportProject: async () => undefined, importProject: async () => null },
      capabilities,
      capabilities.localBackups
        ? {
            databaseSnapshots: async () => [],
            backupNow: async () => undefined,
            openBackupFolder: async () => undefined,
            restoreDatabaseSnapshot: async () => undefined,
          }
        : null,
    );
    await client.projects.list();
    await client.notes.list("project-id");
    await client.settings.credential();
    expect(client.capabilities).toEqual(capabilities);
    expect(Boolean(client.backups)).toBe(capabilities.localBackups);
    expect(operations).toEqual([
      "GET /api/projects",
      "GET /api/projects/project-id/notes",
      "GET /api/settings/openrouter",
    ]);
  });
});
