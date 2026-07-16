# Windows desktop release guide

## Release contract

Skriv ships as a Windows x64 current-user NSIS installer. Production releases use mandatory Tauri updater signatures. Authenticode is optional but recommended to reduce Windows trust warnings. The first updater-enabled build must be installed manually by users of 0.1.3 or earlier.

The Tauri configuration version is canonical. Change it only with:

```powershell
pnpm desktop:version 0.1.4
```

Commit all synchronized version files and update `CHANGELOG.md` before dispatching a release.

## GitHub configuration

Create these Actions values:

- Variable `TAURI_UPDATER_PUBLIC_KEY` — public updater key embedded in release configuration.
- Secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — mandatory updater-signing material.
- Optional secrets `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` — base64 PFX and its password.
- Variable `WINDOWS_TIMESTAMP_URL` — mandatory when the Authenticode certificate is configured.

Keep private keys out of files, logs, workflow inputs, release notes, and support reports. Normal development builds do not contain the production endpoint and do not need signing values.

## Create and validate a draft

1. Merge the committed version and changelog to `main`; confirm Unified CI passes.
2. Dispatch **Desktop Release** from `main` with the exact committed version and the appropriate prerelease flag.
3. The workflow reruns JavaScript, web, Rust, and compatibility validation; generates the release-only updater configuration; builds NSIS updater artifacts; and creates a draft GitHub release.
4. Confirm the draft contains the `.exe`, its `.sig`, `latest.json`, and `.sha256`. Confirm workflow logs contain no secrets.
5. If the workflow warned that Authenticode was unavailable, record the expected SmartScreen behavior in the release notes.

## Manual Windows smoke test

- Install for the current user and launch from the Start menu.
- Confirm Settings displays the expected version and can check the signed update endpoint.
- Create and edit projects offline; close normally and verify persistence after restart.
- Verify a clean close creates pending portable backups and **Back up now** works.
- Export and re-import a v5 `.skriv` archive containing revisions, notes, chat, a cover, and a compendium image.
- Import a representative schema-v4 JSON archive.
- Export Markdown, DOCX, and PDF manuscripts and inspect each file.
- Add, replace, and remove an OpenRouter key; confirm non-AI work remains available.
- Exercise a successful, cancelled, and failed update from a disposable test release/channel.
- Inspect the installer signature, updater signature, checksum, and `latest.json` URLs.

Publish only after the checklist passes. Stable clients use the latest stable release endpoint; prereleases are not promoted into that channel.

## Rollback and key rotation

Never reuse a version, replace published artifacts, or enable downgrades. Fix a bad build with a higher patch release. If an updater key must rotate, first ship a bridge release signed by the old key that embeds the new public key; later releases may then use the new private key. Loss of the active private key without a bridge release requires users to install a new build manually.
