# Skriv desktop privacy

This notice applies to the Windows desktop edition of Skriv.

## Data stored on the computer

Skriv stores projects and settings locally in `%LOCALAPPDATA%\Skriv\skriv.sqlite3`. Recovery snapshots and portable project backups are stored under `%LOCALAPPDATA%\Skriv\backups`. Project archives and manuscript exports are written only to locations selected by the user.

An OpenRouter API key, when configured, is stored in Windows Credential Manager under the service `com.zebevafasen.skriv`. It is not included in project archives or backups.

Uninstalling the application may leave local projects and backups in `%LOCALAPPDATA%\Skriv` so that an uninstall does not silently destroy writing. Users should back up their work and remove that folder manually if they want to erase all local Skriv data.

## Network access

Non-AI writing features work without a network connection. Skriv connects directly to OpenRouter only when the user validates an API key, loads the available model list, or invokes an AI feature. Prompts, selected writing context, and generated content used for those requests are sent to OpenRouter and the selected model provider, subject to their policies.

The desktop edition has no Skriv account, cloud synchronization, advertising, or application telemetry. Checking GitHub for a new release is currently a manual user action; the app does not perform an automatic update check.

## User responsibility

Users control the files they import and export. Before sharing a `.skriv` archive, they should treat it as a copy of the corresponding project, including manuscript text, project notes, compendium entries, revisions, chat history, and embedded images.

This notice should be reviewed whenever networking, telemetry, crash reporting, synchronization, or automatic updates are added.
