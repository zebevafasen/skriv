import type { AsterismClient, ClientRequest, RequestTransport } from "@asterism/application";
import { AppError, createAsterismClient } from "@asterism/application";
import { createLocalRequestDispatcher } from "@asterism/local-store";
import { invoke } from "@tauri-apps/api/core";

type NativeErrorPayload = { code?: string; message?: string };

function body<T>(init?: ClientRequest): T {
  if (typeof init?.body !== "string") throw new AppError("A JSON body is required.", "BAD_REQUEST");
  return JSON.parse(init.body) as T;
}

async function invokeApp<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const payload = error as NativeErrorPayload;
    throw new AppError(
      payload.message ?? (error instanceof Error ? error.message : String(error)),
      payload.code === "PROVIDER_ERROR"
        ? "PROVIDER_ERROR"
        : payload.code === "CREDENTIAL_ERROR"
          ? "CREDENTIAL_ERROR"
          : payload.code === "CANCELLED"
            ? "CANCELLED"
            : payload.code === "FILE_ERROR"
              ? "FILE_ERROR"
              : payload.code === "DATABASE_ERROR"
                ? "DATABASE_ERROR"
                : payload.code === "CONFLICT"
                  ? "CONFLICT"
                  : "INTERNAL_ERROR",
    );
  }
}

export type DesktopClient = AsterismClient & { shutdown(): Promise<void> };

export function createDesktopClient(): DesktopClient {
  const dispatcher = createLocalRequestDispatcher();
  const transport: RequestTransport = {
    request<T>(path: string, init?: ClientRequest): Promise<T> {
      if (path === "/api/settings/openrouter" && (init?.method ?? "GET") === "GET") {
        return invokeApp<T>("credential_status");
      }
      if (path === "/api/settings/openrouter" && init?.method === "PUT") {
        return invokeApp<T>("save_openrouter_credential", {
          request: body<{ apiKey: string }>(init),
        });
      }
      if (path === "/api/settings/openrouter" && init?.method === "DELETE") {
        return invokeApp<T>("delete_openrouter_credential");
      }
      if (path === "/api/models" && (init?.method ?? "GET") === "GET") {
        return invokeApp<T>("list_models");
      }
      if (path === "/api/backups/database" && (init?.method ?? "GET") === "GET") {
        return invokeApp<T>("list_database_snapshots");
      }
      if (path === "/api/backups/projects" && init?.method === "POST") {
        return Promise.all([dispatcher.backupAll(), invokeApp("create_database_snapshot")]).then(
          ([, snapshot]) => snapshot as T,
        );
      }
      if (path === "/api/backups/open" && init?.method === "POST") {
        return invokeApp<T>("open_backup_folder");
      }
      if (path === "/api/backups/database/restore" && init?.method === "POST") {
        return invokeApp<T>("restore_database_snapshot", {
          request: body<{ name: string }>(init),
        });
      }
      return dispatcher.request<T>(path, init);
    },
  };
  const client = createAsterismClient(
    transport,
    {
      generation(input, onEvent, signal) {
        return dispatcher.streamGeneration(input, onEvent, signal);
      },
      chat(path, content, onEvent, signal) {
        return dispatcher.streamChat(path, content, onEvent, signal);
      },
    },
    {
      exportProject(projectId, options) {
        return dispatcher.exportProject(projectId, options);
      },
      importProject() {
        return dispatcher.importProject();
      },
    },
  );
  return {
    ...client,
    shutdown() {
      return dispatcher.shutdown();
    },
  };
}

export function unavailableNativeFeature(message: string): never {
  throw new AppError(message, "INTERNAL_ERROR");
}
