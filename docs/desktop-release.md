# Desktop early-release guide

## Supported release

Skriv 0.1.2 is an early-access Windows x64 desktop application. The supported artifact is the current-user NSIS installer produced by `pnpm desktop:build`. It installs without administrator access. WebView2 is required; the installer downloads its bootstrapper when the runtime is missing, so installation may require internet access even though non-AI use is offline.

The desktop and web editions do not synchronize. A `.skriv` project archive is the supported transfer and portable-backup format.

## Before creating a release

1. Update the version in `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/package.json`.
2. Update `CHANGELOG.md` and review `PRIVACY.md`.
3. Run `pnpm desktop:release-check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:native`, and `pnpm desktop:build`.
4. Install the generated NSIS artifact on a clean or disposable Windows user profile and complete the manual checklist below.
5. Commit the exact release state and create a matching annotated tag, for example `v0.1.2`.
6. Push the tag. The Desktop Release workflow builds a fresh installer and checksum, then creates a draft GitHub Release.
7. Review the draft, add the launch notes and SmartScreen disclosure, verify the attached checksum, and publish intentionally.

Do not upload a locally built installer as a substitute for the workflow artifact. Users should be able to associate every installer with an exact tag and automated build log.

## Manual Windows checklist

- Install as a current user, launch from the Start menu, and confirm Settings shows the tagged version.
- Create a project offline, write in multiple scenes, close normally, restart, and confirm all content persists.
- Force-close once after editing, restart, and confirm the last autosaved content is present.
- Export and re-import a `.skriv` archive containing revisions, notes, chat, a cover, and a compendium image.
- Export Markdown, DOCX, and PDF manuscripts and inspect each file.
- Use **Back up now**, inspect the backup folder, and restore a database snapshot after making a recognizable change.
- Delete a test project, confirm its pre-delete portable backup exists, and re-import it.
- Add, replace, and remove an OpenRouter key. Confirm non-AI features remain usable without it.
- Run an AI request, cancel an AI request, and confirm a provider/network failure is understandable and does not lose text.
- Uninstall and confirm the release notes accurately describe whether local data remains.

## GitHub Release contents

Attach only:

- `Skriv_<version>_x64-setup.exe`
- `Skriv_<version>_x64-setup.exe.sha256`

Release notes should state that this is early access, Windows x64 only, where data and backups live, how updates work, whether the installer is signed, and where users should report reproducible bugs. Ask reports to include the Skriv version, Windows version, exact steps, expected behavior, and actual behavior—but never API keys or private manuscript content.

The repository and every release page must link to `LICENSE` and describe Skriv as proprietary alpha software, not open source. Publishing source on GitHub does not grant permission to reuse, modify, or redistribute it.

## Signing and updates

The current build does not configure Authenticode signing or automatic updates. An unsigned installer is acceptable only for a small, clearly disclosed test release; it will encounter stronger Windows trust warnings and may be blocked by managed devices.

Before a broader public launch, obtain an appropriate code-signing identity and sign every installer consistently. Do not use a self-signed certificate for public distribution. Keep manual GitHub updates for the early release; add an updater only after the update channel, signing keys, rollback behavior, and failure recovery have been tested.
