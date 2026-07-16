import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const STABLE_UPDATER_ENDPOINT =
  "https://github.com/zebevafasen/asterism/releases/latest/download/latest.json";

const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
if (!publicKey) {
  console.error("TAURI_UPDATER_PUBLIC_KEY is required to create a release configuration.");
  process.exit(1);
}

const certificateThumbprint = process.env.WINDOWS_CERTIFICATE_THUMBPRINT?.trim();
const timestampUrl = process.env.WINDOWS_TIMESTAMP_URL?.trim();
if (certificateThumbprint && !timestampUrl) {
  console.error("WINDOWS_TIMESTAMP_URL is required when Authenticode signing is enabled.");
  process.exit(1);
}

const windows = {
  webviewInstallMode: { type: "downloadBootstrapper" },
  nsis: { installMode: "currentUser" },
  ...(certificateThumbprint
    ? { certificateThumbprint, timestampUrl, digestAlgorithm: "sha256" }
    : {}),
};
const config = {
  bundle: { createUpdaterArtifacts: true, windows },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [STABLE_UPDATER_ENDPOINT],
    },
  },
};

const output = path.resolve(
  import.meta.dirname,
  "../apps/desktop/src-tauri/tauri.release.conf.json",
);
await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(
  `Created ${path.relative(path.resolve(import.meta.dirname, ".."), output)} with updater signing${
    certificateThumbprint ? " and Authenticode signing" : " (without Authenticode)"
  }.`,
);
