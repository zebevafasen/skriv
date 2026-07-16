import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [tauriSource, cargoSource, packageSource, licenseSource] = await Promise.all([
  read("apps/desktop/src-tauri/tauri.conf.json"),
  read("apps/desktop/src-tauri/Cargo.toml"),
  read("apps/desktop/package.json"),
  read("LICENSE"),
]);

const tauriVersion = JSON.parse(tauriSource).version;
const packageVersion = JSON.parse(packageSource).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoSource)?.[1];

const versions = {
  "tauri.conf.json": tauriVersion,
  "Cargo.toml": cargoVersion,
  "desktop package.json": packageVersion,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== tauriVersion);

if (!tauriVersion || mismatches.length > 0) {
  console.error("Desktop release versions are inconsistent:");
  for (const [source, version] of Object.entries(versions)) {
    console.error(`  ${source}: ${version ?? "missing"}`);
  }
  process.exit(1);
}

if (!licenseSource.includes("All rights reserved") || !licenseSource.includes("proprietary")) {
  console.error("The desktop release must include the proprietary alpha LICENSE notice.");
  process.exit(1);
}

if (process.env.GITHUB_REF_TYPE === "tag") {
  const expectedTag = `v${tauriVersion}`;
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    console.error(`Release tag must be ${expectedTag}, received ${process.env.GITHUB_REF_NAME}.`);
    process.exit(1);
  }
}

console.log(`Desktop release metadata is consistent at ${tauriVersion}.`);
