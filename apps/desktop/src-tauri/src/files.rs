use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::database::DatabaseState;
use crate::error::{NativeError, NativeResult};

const MAX_ARCHIVE_SIZE: u64 = 250 * 1024 * 1024;
const MAX_ASSET_SIZE: u64 = 20 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBytesRequest {
    suggested_name: String,
    extension: String,
    label: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
pub struct ArchiveAssetInput {
    path: String,
    mime: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveArchiveRequest {
    suggested_name: String,
    application_version: String,
    project: JsonValue,
    assets: Vec<ArchiveAssetInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBackupRequest {
    project_id: String,
    title: String,
    application_version: String,
    project: JsonValue,
    assets: Vec<ArchiveAssetInput>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    path: String,
    size: u64,
    sha256: String,
    mime: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveManifest {
    format: String,
    schema_version: u32,
    application_version: String,
    exported_at: String,
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Serialize)]
pub struct OpenedAsset {
    path: String,
    mime: String,
    base64: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OpenedProject {
    V5 {
        project: JsonValue,
        assets: Vec<OpenedAsset>,
    },
    V4 {
        project: JsonValue,
    },
}

fn file_error(error: impl std::fmt::Display) -> NativeError {
    NativeError::File(error.to_string())
}

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn valid_archive_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    !normalized.is_empty()
        && !normalized.starts_with('/')
        && !normalized
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        && Path::new(path).is_relative()
}

fn save_path(
    app: &AppHandle,
    request: &SaveBytesRequest,
) -> NativeResult<Option<std::path::PathBuf>> {
    app.dialog()
        .file()
        .add_filter(&request.label, &[request.extension.as_str()])
        .set_file_name(&request.suggested_name)
        .blocking_save_file()
        .map(|path| path.into_path().map_err(file_error))
        .transpose()
}

fn build_archive_bytes(
    application_version: String,
    project: JsonValue,
    assets: Vec<ArchiveAssetInput>,
) -> NativeResult<Vec<u8>> {
    let project_bytes = serde_json::to_vec_pretty(&project).map_err(file_error)?;
    let mut entries = vec![ManifestEntry {
        path: "project.json".into(),
        size: project_bytes.len() as u64,
        sha256: sha256(&project_bytes),
        mime: Some("application/json".into()),
    }];
    let mut seen = HashSet::new();
    seen.insert("project.json".to_owned());
    let mut total = project_bytes.len() as u64;
    for asset in &assets {
        if !valid_archive_path(&asset.path) || !asset.path.starts_with("assets/") {
            return Err(NativeError::File("Invalid archive asset path.".into()));
        }
        if !seen.insert(asset.path.clone()) {
            return Err(NativeError::File("Duplicate archive asset path.".into()));
        }
        if asset.bytes.len() as u64 > MAX_ASSET_SIZE {
            return Err(NativeError::File("An archive asset exceeds 20 MiB.".into()));
        }
        total += asset.bytes.len() as u64;
        entries.push(ManifestEntry {
            path: asset.path.clone(),
            size: asset.bytes.len() as u64,
            sha256: sha256(&asset.bytes),
            mime: Some(asset.mime.clone()),
        });
    }
    if total > MAX_ARCHIVE_SIZE {
        return Err(NativeError::File(
            "Project archive exceeds 250 MiB uncompressed.".into(),
        ));
    }
    let manifest = ArchiveManifest {
        format: "skriv-project".into(),
        schema_version: 5,
        application_version,
        exported_at: Utc::now().to_rfc3339(),
        entries,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(file_error)?;
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    writer
        .start_file("manifest.json", options)
        .map_err(file_error)?;
    writer.write_all(&manifest_bytes)?;
    writer
        .start_file("project.json", options)
        .map_err(file_error)?;
    writer.write_all(&project_bytes)?;
    for asset in assets {
        writer.start_file(asset.path, options).map_err(file_error)?;
        writer.write_all(&asset.bytes)?;
    }
    Ok(writer.finish().map_err(file_error)?.into_inner())
}

fn project_backup_dir(database_path: &Path, project_id: &str) -> NativeResult<PathBuf> {
    if project_id.is_empty()
        || project_id.len() > 64
        || !project_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(NativeError::File(
            "Invalid project backup identifier.".into(),
        ));
    }
    let parent = database_path
        .parent()
        .ok_or_else(|| NativeError::File("Database path has no parent directory.".into()))?;
    Ok(parent.join("backups").join("projects").join(project_id))
}

fn safe_title(title: &str) -> String {
    let value = title
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = value.trim_matches('-');
    if trimmed.is_empty() {
        "project".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn project_backup_paths(directory: &Path) -> NativeResult<Vec<PathBuf>> {
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut paths = std::fs::read_dir(directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("skriv"))
        .collect::<Vec<_>>();
    paths.sort_by_key(|path| {
        std::cmp::Reverse(
            std::fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .unwrap_or(UNIX_EPOCH),
        )
    });
    Ok(paths)
}

fn retained_project_backup_indices(
    timestamps: &[DateTime<Utc>],
    now: DateTime<Utc>,
) -> HashSet<usize> {
    let mut keep = (0..timestamps.len().min(10)).collect::<HashSet<_>>();
    let cutoff = now - Duration::days(30);
    let mut daily = HashSet::new();
    for (index, timestamp) in timestamps.iter().enumerate() {
        if *timestamp >= cutoff && daily.insert(timestamp.date_naive()) {
            keep.insert(index);
        }
    }
    keep
}

fn retain_project_backups(directory: &Path) -> NativeResult<()> {
    let paths = project_backup_paths(directory)?;
    let timestamps = paths
        .iter()
        .map(|path| {
            let modified = std::fs::metadata(path)?.modified().unwrap_or(UNIX_EPOCH);
            let millis = modified
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;
            Ok(Utc
                .timestamp_millis_opt(millis)
                .single()
                .unwrap_or_else(Utc::now))
        })
        .collect::<NativeResult<Vec<_>>>()?;
    let keep = retained_project_backup_indices(&timestamps, Utc::now());
    for (index, path) in paths.into_iter().enumerate() {
        if !keep.contains(&index) {
            std::fs::remove_file(path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn save_bytes(app: AppHandle, request: SaveBytesRequest) -> NativeResult<bool> {
    let Some(path) = save_path(&app, &request)? else {
        return Ok(false);
    };
    std::fs::write(path, request.bytes)?;
    Ok(true)
}

#[tauri::command]
pub async fn save_project_archive(
    app: AppHandle,
    request: SaveArchiveRequest,
) -> NativeResult<bool> {
    let bytes = build_archive_bytes(request.application_version, request.project, request.assets)?;
    let save_request = SaveBytesRequest {
        suggested_name: request.suggested_name,
        extension: "skriv".into(),
        label: "Skriv project".into(),
        bytes,
    };
    save_bytes(app, save_request).await
}

#[tauri::command]
pub async fn write_project_backup(
    state: State<'_, DatabaseState>,
    request: ProjectBackupRequest,
) -> NativeResult<()> {
    let directory = project_backup_dir(&state.path, &request.project_id)?;
    std::fs::create_dir_all(&directory)?;
    let bytes = build_archive_bytes(request.application_version, request.project, request.assets)?;
    let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let path = directory.join(format!("{timestamp}-{}.skriv", safe_title(&request.title)));
    std::fs::write(path, bytes)?;
    retain_project_backups(&directory)
}

#[tauri::command]
pub async fn open_project_archive(app: AppHandle) -> NativeResult<Option<OpenedProject>> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Skriv projects", &["skriv", "json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(file_error)?;
    let metadata = std::fs::metadata(&path)?;
    if metadata.len() > MAX_ARCHIVE_SIZE {
        return Err(NativeError::File("Project file exceeds 250 MiB.".into()));
    }
    let bytes = std::fs::read(&path)?;
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
        .as_deref()
        == Some("json")
    {
        let project = serde_json::from_slice(&bytes)?;
        return Ok(Some(OpenedProject::V4 { project }));
    }

    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(file_error)?;
    let mut seen = HashSet::new();
    let mut total = 0_u64;
    let mut contents = HashMap::<String, Vec<u8>>::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(file_error)?;
        let name = file.name().replace('\\', "/");
        if !valid_archive_path(&name) || file.enclosed_name().is_none() {
            return Err(NativeError::File("Archive contains an unsafe path.".into()));
        }
        if !seen.insert(name.clone()) {
            return Err(NativeError::File(
                "Archive contains duplicate paths.".into(),
            ));
        }
        if file.is_dir() {
            continue;
        }
        if name.starts_with("assets/") && file.size() > MAX_ASSET_SIZE {
            return Err(NativeError::File("An archive asset exceeds 20 MiB.".into()));
        }
        total = total.saturating_add(file.size());
        if total > MAX_ARCHIVE_SIZE {
            return Err(NativeError::File(
                "Archive exceeds 250 MiB uncompressed.".into(),
            ));
        }
        let mut content = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut content)?;
        contents.insert(name, content);
    }
    let manifest_bytes = contents
        .remove("manifest.json")
        .ok_or_else(|| NativeError::File("Archive manifest is missing.".into()))?;
    let manifest: ArchiveManifest = serde_json::from_slice(&manifest_bytes)?;
    if manifest.format != "skriv-project" || manifest.schema_version != 5 {
        return Err(NativeError::File(
            "Unsupported Skriv archive version.".into(),
        ));
    }
    let manifest_paths = manifest
        .entries
        .iter()
        .map(|entry| entry.path.clone())
        .collect::<HashSet<_>>();
    if manifest_paths.len() != manifest.entries.len() || manifest_paths.len() != contents.len() {
        return Err(NativeError::File(
            "Archive manifest paths do not match its contents.".into(),
        ));
    }
    for entry in &manifest.entries {
        let content = contents.get(&entry.path).ok_or_else(|| {
            NativeError::File("Archive entry listed in the manifest is missing.".into())
        })?;
        if content.len() as u64 != entry.size || sha256(content) != entry.sha256 {
            return Err(NativeError::File(format!(
                "Archive checksum failed for {}.",
                entry.path
            )));
        }
    }
    let project_bytes = contents
        .remove("project.json")
        .ok_or_else(|| NativeError::File("Archive project payload is missing.".into()))?;
    let project = serde_json::from_slice(&project_bytes)?;
    let mime_by_path = manifest
        .entries
        .into_iter()
        .map(|entry| {
            (
                entry.path,
                entry
                    .mime
                    .unwrap_or_else(|| "application/octet-stream".into()),
            )
        })
        .collect::<HashMap<_, _>>();
    let assets = contents
        .into_iter()
        .filter(|(path, _)| path.starts_with("assets/"))
        .map(|(path, bytes)| OpenedAsset {
            mime: mime_by_path
                .get(&path)
                .cloned()
                .unwrap_or_else(|| "application/octet-stream".into()),
            path,
            base64: BASE64.encode(bytes),
        })
        .collect();
    Ok(Some(OpenedProject::V5 { project, assets }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn archive_paths_reject_traversal_and_absolute_paths() {
        assert!(valid_archive_path("assets/cover.png"));
        assert!(!valid_archive_path("../skriv.sqlite3"));
        assert!(!valid_archive_path("assets//cover.png"));
        assert!(!valid_archive_path("C:\\secret.txt"));
        assert!(!valid_archive_path("/secret.txt"));
    }

    #[test]
    fn generated_archive_contains_a_checksum_manifest() {
        let bytes = build_archive_bytes(
            "0.1.0".into(),
            json!({ "schemaVersion": 5 }),
            vec![ArchiveAssetInput {
                path: "assets/cover.png".into(),
                mime: "image/png".into(),
                bytes: vec![1, 2, 3],
            }],
        )
        .expect("archive bytes");
        let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("zip archive");
        let manifest: ArchiveManifest =
            serde_json::from_reader(archive.by_name("manifest.json").expect("manifest entry"))
                .expect("manifest JSON");
        assert_eq!(manifest.schema_version, 5);
        assert_eq!(manifest.entries.len(), 2);
        assert!(manifest
            .entries
            .iter()
            .all(|entry| entry.sha256.len() == 64));
    }

    #[test]
    fn project_backup_retention_keeps_ten_newest_and_thirty_daily_points() {
        let now = Utc::now();
        let timestamps = (0..40)
            .map(|days| now - Duration::days(days))
            .collect::<Vec<_>>();
        let keep = retained_project_backup_indices(&timestamps, now);
        assert!((0..10).all(|index| keep.contains(&index)));
        assert!(keep.contains(&29));
        assert!(!keep.contains(&31));
    }
}
