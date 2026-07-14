import {
  projectArchiveManifestV5Schema,
  projectArchiveV5Schema,
  type ProjectArchiveManifestEntry,
  type ProjectArchiveManifestV5,
  type ProjectArchiveV5,
} from "@asterism/contracts";
import { unzipSync, zipSync } from "fflate";
import { AppError } from "./client.js";

export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
export const MAX_ARCHIVE_ASSET_BYTES = 20 * 1024 * 1024;

export type PortableArchiveAsset = { path: string; mime: string; bytes: Uint8Array };
export type DecodedProjectArchive = {
  manifest: ProjectArchiveManifestV5;
  project: ProjectArchiveV5;
  assets: PortableArchiveAsset[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", source.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseCentralDirectory(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const lower = Math.max(0, bytes.length - 65_557);
  for (let index = bytes.length - 22; index >= lower; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new AppError("The archive ZIP directory is missing.", "VALIDATION_ERROR");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const names: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new AppError("The archive ZIP directory is malformed.", "VALIDATION_ERROR");
    const flags = view.getUint16(offset + 8, true);
    if ((flags & 1) !== 0) throw new AppError("Encrypted ZIP entries are unsupported.", "VALIDATION_ERROR");
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (!validPath(name)) throw new AppError("The archive contains an unsafe path.", "VALIDATION_ERROR");
    if (!seen.add(name)) throw new AppError("The archive contains a duplicate path.", "VALIDATION_ERROR");
    if (name.startsWith("assets/") && size > MAX_ARCHIVE_ASSET_BYTES)
      throw new AppError("An archive asset exceeds 20 MiB.", "VALIDATION_ERROR");
    total += size;
    if (total > MAX_ARCHIVE_UNCOMPRESSED_BYTES)
      throw new AppError("The archive exceeds 250 MiB uncompressed.", "VALIDATION_ERROR");
    names.push(name);
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return names;
}

export async function encodeProjectArchive(
  project: ProjectArchiveV5,
  assets: PortableArchiveAsset[],
  applicationVersion: string,
): Promise<Uint8Array> {
  const parsedProject = projectArchiveV5Schema.parse(project);
  const projectBytes = encoder.encode(JSON.stringify(parsedProject, null, 2));
  const files: Record<string, Uint8Array> = { "project.json": projectBytes };
  const entries: ProjectArchiveManifestEntry[] = [
    {
      path: "project.json",
      size: projectBytes.length,
      sha256: await sha256(projectBytes),
      mime: "application/json",
    },
  ];
  let total = projectBytes.length;
  for (const asset of assets) {
    if (!validPath(asset.path) || !asset.path.startsWith("assets/"))
      throw new AppError("An archive asset has an invalid path.", "VALIDATION_ERROR");
    if (files[asset.path]) throw new AppError("An archive asset path is duplicated.", "VALIDATION_ERROR");
    if (asset.bytes.length > MAX_ARCHIVE_ASSET_BYTES)
      throw new AppError("An archive asset exceeds 20 MiB.", "VALIDATION_ERROR");
    total += asset.bytes.length;
    if (total > MAX_ARCHIVE_UNCOMPRESSED_BYTES)
      throw new AppError("The archive exceeds 250 MiB uncompressed.", "VALIDATION_ERROR");
    files[asset.path] = asset.bytes;
    entries.push({
      path: asset.path,
      size: asset.bytes.length,
      sha256: await sha256(asset.bytes),
      mime: asset.mime,
    });
  }
  const manifest = projectArchiveManifestV5Schema.parse({
    format: "asterism-project",
    schemaVersion: 5,
    applicationVersion,
    exportedAt: new Date().toISOString(),
    entries,
  });
  return zipSync({ "manifest.json": encoder.encode(JSON.stringify(manifest, null, 2)), ...files }, { level: 6 });
}

export async function decodeProjectArchive(bytes: Uint8Array): Promise<DecodedProjectArchive> {
  const directoryNames = parseCentralDirectory(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "The archive ZIP could not be opened.",
      "VALIDATION_ERROR",
    );
  }
  if (!directoryNames.includes("manifest.json") || !files["manifest.json"] || !files["project.json"])
    throw new AppError("The archive manifest or project payload is missing.", "VALIDATION_ERROR");
  const manifest = projectArchiveManifestV5Schema.parse(
    JSON.parse(decoder.decode(files["manifest.json"])),
  );
  const expected = new Set(manifest.entries.map((entry) => entry.path));
  if (expected.size !== manifest.entries.length)
    throw new AppError("The archive manifest contains duplicate paths.", "VALIDATION_ERROR");
  const actual = directoryNames.filter((path) => path !== "manifest.json");
  if (actual.length !== expected.size || actual.some((path) => !expected.has(path)))
    throw new AppError("The archive manifest does not match its contents.", "VALIDATION_ERROR");
  for (const entry of manifest.entries) {
    const content = files[entry.path];
    if (!content || content.length !== entry.size || (await sha256(content)) !== entry.sha256)
      throw new AppError(`Archive checksum failed for ${entry.path}.`, "VALIDATION_ERROR");
  }
  const project = projectArchiveV5Schema.parse(JSON.parse(decoder.decode(files["project.json"])));
  const assets = manifest.entries
    .filter((entry) => entry.path.startsWith("assets/"))
    .map((entry) => ({ path: entry.path, mime: entry.mime ?? "application/octet-stream", bytes: files[entry.path] as Uint8Array }));
  if (project.assets.some((reference) => !assets.some((asset) => asset.path === reference.path)))
    throw new AppError("An archive image is missing.", "VALIDATION_ERROR");
  return { manifest, project, assets };
}
