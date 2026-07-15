import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceAliases = Object.fromEntries(
  ["ai", "application", "config", "content", "contracts", "core", "db"].map((name) => [
    `@skriv/${name}`,
    resolve(root, `packages/${name}/src/index.ts`),
  ]),
);
workspaceAliases["@skriv/db/schema"] = resolve(root, "packages/db/src/schema.ts");

await mkdir(resolve(root, ".vercel-build"), { recursive: true });
await build({
  entryPoints: [resolve(root, "apps/api/src/vercel.ts")],
  outfile: resolve(root, ".vercel-build/api-handler.mjs"),
  alias: workspaceAliases,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  bundle: true,
  format: "esm",
  platform: "node",
  sourcemap: true,
  target: "node24",
});
