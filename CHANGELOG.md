# Changelog

## 0.1.5 - Compendium extraction and editor mentions

- Add AI-assisted compendium entry extraction to quickly identify and define characters, locations, and items from text.
- Add real-time compendium mentions and auto-completion in the manuscript editor and notes.
- Support interactive review and editing of extracted compendium entries before saving.
- Add application-wide fixes for TipTap rendering and layout issues.

## 0.1.4 - Major code restructure and support for application auto-update

- Removed legacy code.
- Added support for auto-update via GitHub.

## 0.1.3 - Desktop release foundation

- Prevent partial project-setting changes from clearing author and other metadata.
- Keep cover-only changes from unexpectedly reordering the library.
- Expand generated covers with distinct curated palette families and stronger visual variation.
- Fix multiline Markdown shortcuts in chat and share them with Compendium descriptions.
- Improve the Compendium description editor's size, drawer layout, formatting, and empty-state focus behavior.
- Add signed automatic update support, explicit download/install approval, persistent operational logging, and draft-only release automation.
- Remove deprecated tag-pack runtime APIs while retaining archive and saved-data compatibility.

## 0.1.2 - Early access

- Windows-first Tauri desktop application with local SQLite storage.
- Continuous manuscript editor, ideation tools, notes, compendium, chat, and manuscript export.
- Optional OpenRouter integration with the API key stored in Windows Credential Manager.
- Portable checksummed `.skriv` project import and export.
- Automatic portable project backups, daily database snapshots, and in-app recovery controls.

Known limitations:

- Windows is the only supported desktop platform for this release.
- Version 0.1.3 and earlier require a manual installer upgrade before automatic updates become available.
- Unsigned development releases may trigger Windows SmartScreen warnings.
- The web application and desktop application do not synchronize.
