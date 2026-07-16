import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [
  tauriSource,
  cargoSource,
  cargoLockSource,
  packageSource,
  rootPackageSource,
  licenseSource,
  releaseConfigSource,
] = await Promise.all([
  read("apps/desktop/src-tauri/tauri.conf.json"),
  read("apps/desktop/src-tauri/Cargo.toml"),
  read("apps/desktop/src-tauri/Cargo.lock"),
  read("apps/desktop/package.json"),
  read("package.json"),
  read("LICENSE"),
  read("scripts/create-desktop-release-config.mjs"),
]);

const tauriConfig = JSON.parse(tauriSource);
const tauriVersion = tauriConfig.version;
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const semverMatch = semver.exec(tauriVersion ?? "");
const malformedNumericPrerelease = semverMatch?.[4]
  ?.split(".")
  .some((part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith("0"));
if (!semverMatch || malformedNumericPrerelease) {
  console.error(`Tauri configuration version is not valid SemVer: ${tauriVersion ?? "missing"}.`);
  process.exit(1);
}
const packageVersion = JSON.parse(packageSource).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoSource)?.[1];
const cargoLockVersion = /\[\[package\]\]\nname = "skriv"\nversion = "([^"]+)"/.exec(
  cargoLockSource,
)?.[1];

const versions = {
  "tauri.conf.json": tauriVersion,
  "Cargo.toml": cargoVersion,
  "Cargo.lock": cargoLockVersion,
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

if (Object.hasOwn(JSON.parse(rootPackageSource), "version")) {
  console.error("The private workspace root must not declare a misleading release version.");
  process.exit(1);
}

const stableEndpoint =
  "https://github.com/zebevafasen/asterism/releases/latest/download/latest.json";
if (!releaseConfigSource.includes(stableEndpoint)) {
  console.error("The generated release configuration does not use the stable GitHub endpoint.");
  process.exit(1);
}
if (tauriConfig.bundle?.createUpdaterArtifacts) {
  console.error("Updater artifacts must only be enabled in the generated release configuration.");
  process.exit(1);
}
const developmentUpdater = tauriConfig.plugins?.updater;
if (
  developmentUpdater?.pubkey !== "" ||
  !Array.isArray(developmentUpdater?.endpoints) ||
  developmentUpdater.endpoints.length !== 0
) {
  console.error(
    "The normal desktop configuration must contain an inert updater configuration with no endpoint or key.",
  );
  process.exit(1);
}

const requiredReleaseSurface = [
  [cargoSource, "tauri-plugin-updater"],
  [cargoSource, "tauri-plugin-process"],
  [cargoSource, "tauri-plugin-log"],
  [packageSource, "@tauri-apps/plugin-updater"],
  [packageSource, "@tauri-apps/plugin-process"],
  [packageSource, "@tauri-apps/plugin-log"],
];
for (const [source, dependency] of requiredReleaseSurface) {
  if (!source.includes(dependency)) {
    console.error(`Desktop release dependency is missing: ${dependency}.`);
    process.exit(1);
  }
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

if (process.env.DESKTOP_RELEASE_VERSION && process.env.DESKTOP_RELEASE_VERSION !== tauriVersion) {
  console.error(
    `Workflow version ${process.env.DESKTOP_RELEASE_VERSION} must match the committed desktop version ${tauriVersion}.`,
  );
  process.exit(1);
}

const releaseConfigPath = path.join(root, "apps/desktop/src-tauri/tauri.release.conf.json");
try {
  await access(releaseConfigPath);
  const generated = JSON.parse(await readFile(releaseConfigPath, "utf8"));
  if (
    generated.bundle?.createUpdaterArtifacts !== true ||
    generated.plugins?.updater?.endpoints?.[0] !== stableEndpoint ||
    !generated.plugins?.updater?.pubkey
  ) {
    console.error("The generated desktop release configuration is incomplete or malformed.");
    process.exit(1);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(`Desktop release metadata is consistent at ${tauriVersion}.`);
