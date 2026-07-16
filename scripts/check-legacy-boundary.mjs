import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["apps", "packages"];
const extensions = new Set([".ts", ".tsx"]);
const patterns = [
  /@deprecated\b/,
  /\bpackIds\b/,
  /\btagPackIds\b/,
  /\/api\/tag-pack/,
  /\/tag-packs?\b/,
  /\b(?:TagPack|tagPack)\w*\b/,
  /\bprojectTagPacks\b/,
  /(?:legacyProject|LegacyProject)\w*/,
  /\b(?:project_)?tag_pack(?:s|_catalog_nodes)\b/,
];

// Every exception protects a deployed format and names the regression that owns it.
const allowlist = new Map(
  [
    {
      file: "packages/contracts/src/archives.ts",
      reason: "schema-v4 archive contract",
      test: "packages/contracts/src/contracts.test.ts",
    },
    {
      file: "packages/contracts/src/contracts.test.ts",
      reason: "negative tests prove removed request fields are rejected",
      test: "packages/contracts/src/contracts.test.ts",
    },
    {
      file: "packages/local-store/src/archive.ts",
      reason: "desktop schema-v4 import",
      test: "packages/contracts/src/contracts.test.ts",
    },
    {
      file: "packages/local-store/src/dispatcher.ts",
      reason: "desktop schema-v4 import route",
      test: "packages/contracts/src/contracts.test.ts",
    },
    {
      file: "apps/api/src/routes/import.ts",
      reason: "hosted schema-v4 import",
      test: "packages/contracts/src/contracts.test.ts",
    },
    {
      file: "apps/api/src/routes/export.ts",
      reason: "schema-v4 export field retained for portable archives",
      test: "packages/contracts/src/contracts.test.ts",
    },
    {
      file: "packages/db/src/schema.ts",
      reason: "deployed PostgreSQL physical table names",
      test: "apps/desktop/src-tauri/src/database.rs",
    },
  ].map((entry) => [entry.file, entry]),
);

async function sourceFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "target", "dist", "gen"].includes(entry.name)) continue;
    const relative = path.posix.join(relativeDirectory.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(relative)));
    else if (extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
const violations = [];
const usedExceptions = new Set();
for (const relative of files) {
  const source = await readFile(path.join(root, relative), "utf8");
  const matches = patterns.filter((pattern) => pattern.test(source));
  if (!matches.length) continue;
  const exception = allowlist.get(relative);
  if (!exception) {
    violations.push(`${relative}: ${matches.join(", ")}`);
    continue;
  }
  await readFile(path.join(root, exception.test), "utf8");
  usedExceptions.add(relative);
}

if (violations.length) {
  console.error("Deprecated runtime compatibility escaped the documented release boundary:");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

for (const relative of usedExceptions) {
  const exception = allowlist.get(relative);
  console.log(`Retained ${relative}: ${exception.reason}; test: ${exception.test}`);
}
console.log("Legacy runtime APIs are absent; archive and saved-data adapters remain isolated.");
