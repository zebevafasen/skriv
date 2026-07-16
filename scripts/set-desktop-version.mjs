import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const version = process.argv[2]?.trim();
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const match = semver.exec(version ?? "");
const malformedNumericPrerelease = match?.[4]
  ?.split(".")
  .some((part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith("0"));
if (!version || !match || malformedNumericPrerelease) {
  console.error("Usage: pnpm desktop:version <semver>");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const jsonFiles = ["apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/package.json"];
for (const relative of jsonFiles) {
  const file = path.join(root, relative);
  const value = JSON.parse(await readFile(file, "utf8"));
  value.version = version;
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const cargoTomlPath = path.join(root, "apps/desktop/src-tauri/Cargo.toml");
const cargoToml = await readFile(cargoTomlPath, "utf8");
await writeFile(
  cargoTomlPath,
  cargoToml.replace(/(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/, `$1"${version}"`),
  "utf8",
);

const cargoLockPath = path.join(root, "apps/desktop/src-tauri/Cargo.lock");
const cargoLock = await readFile(cargoLockPath, "utf8");
await writeFile(
  cargoLockPath,
  cargoLock.replace(/(\[\[package\]\]\nname = "skriv"\nversion = )"[^"]+"/, `$1"${version}"`),
  "utf8",
);

console.log(`Synchronized desktop release metadata at ${version}.`);
