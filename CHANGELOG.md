# Changelog

## 0.1.3 - Desktop alpha polish

- Prevent partial project-setting changes from clearing author and other metadata.
- Keep cover-only changes from unexpectedly reordering the library.
- Expand generated covers with distinct curated palette families and stronger visual variation.
- Fix multiline Markdown shortcuts in chat and share them with Compendium descriptions.
- Improve the Compendium description editor's size, drawer layout, formatting, and empty-state focus behavior.

## 0.1.2 - Early access

- Windows-first Tauri desktop application with local SQLite storage.
- Continuous manuscript editor, ideation tools, notes, compendium, chat, and manuscript export.
- Optional OpenRouter integration with the API key stored in Windows Credential Manager.
- Portable checksummed `.skriv` project import and export.
- Automatic portable project backups, daily database snapshots, and in-app recovery controls.

Known limitations:

- Windows is the only supported desktop platform for this release.
- Updates are installed manually from GitHub Releases.
- Unsigned development releases may trigger Windows SmartScreen warnings.
- The web application and desktop application do not synchronize.
