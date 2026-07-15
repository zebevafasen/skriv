use chrono::{Datelike, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, Executor, SqliteConnection};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::database::DatabaseState;
use crate::error::{NativeError, NativeResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    name: String,
    created_at: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
pub struct RestoreSnapshotRequest {
    name: String,
}

fn database_backup_dir(database_path: &Path) -> NativeResult<PathBuf> {
    let parent = database_path
        .parent()
        .ok_or_else(|| NativeError::File("Database path has no parent directory.".into()))?;
    Ok(parent.join("backups").join("database"))
}

fn timestamp() -> String {
    Utc::now().format("%Y%m%dT%H%M%S%.3fZ").to_string()
}

async fn vacuum_snapshot(
    connection: &mut SqliteConnection,
    database_path: &Path,
    prefix: &str,
) -> NativeResult<PathBuf> {
    let directory = database_backup_dir(database_path)?;
    std::fs::create_dir_all(&directory)?;
    let path = directory.join(format!("{prefix}-{}.sqlite3", timestamp()));
    sqlx::query("PRAGMA wal_checkpoint(FULL)")
        .execute(&mut *connection)
        .await?;
    sqlx::query("VACUUM INTO ?")
        .bind(path.to_string_lossy().to_string())
        .execute(&mut *connection)
        .await?;
    Ok(path)
}

fn snapshot_info(path: &Path) -> NativeResult<SnapshotInfo> {
    let metadata = std::fs::metadata(path)?;
    let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
    let millis = modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let created_at = Utc
        .timestamp_millis_opt(millis)
        .single()
        .unwrap_or_else(Utc::now)
        .to_rfc3339();
    Ok(SnapshotInfo {
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_owned(),
        created_at,
        size: metadata.len(),
    })
}

fn snapshot_paths(database_path: &Path) -> NativeResult<Vec<PathBuf>> {
    let directory = database_backup_dir(database_path)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut paths = std::fs::read_dir(directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("sqlite3"))
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

fn has_snapshot_today(database_path: &Path, prefix: &str) -> NativeResult<bool> {
    let today = Utc::now().date_naive();
    for path in snapshot_paths(database_path)? {
        if !path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with(prefix))
        {
            continue;
        }
        let modified = std::fs::metadata(path)?.modified().unwrap_or(UNIX_EPOCH);
        let millis = modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        if Utc
            .timestamp_millis_opt(millis)
            .single()
            .is_some_and(|value| value.date_naive() == today)
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn apply_retention(database_path: &Path) -> NativeResult<()> {
    let paths = snapshot_paths(database_path)?;
    let mut keep = HashSet::new();
    for path in paths.iter().take(7) {
        keep.insert(path.clone());
    }
    let mut weekly = HashSet::new();
    for path in paths.iter().skip(7) {
        let modified = std::fs::metadata(path)?.modified().unwrap_or(UNIX_EPOCH);
        let millis = modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let week = Utc
            .timestamp_millis_opt(millis)
            .single()
            .unwrap_or_else(Utc::now)
            .iso_week();
        if weekly.len() < 4 && weekly.insert((week.year(), week.week())) {
            keep.insert(path.clone());
        }
    }
    for path in paths {
        if !keep.contains(&path) {
            std::fs::remove_file(path)?;
        }
    }
    Ok(())
}

pub async fn initialize_database_snapshots(
    connection: &mut SqliteConnection,
    database_path: &Path,
    had_database: bool,
    migration_pending: bool,
) -> NativeResult<()> {
    if had_database && migration_pending {
        vacuum_snapshot(connection, database_path, "pre-migration").await?;
    }
    if had_database && !has_snapshot_today(database_path, "daily-")? {
        vacuum_snapshot(connection, database_path, "daily").await?;
    }
    apply_retention(database_path)?;
    Ok(())
}

pub async fn ensure_daily_database_snapshot(state: &DatabaseState) -> NativeResult<()> {
    if has_snapshot_today(&state.path, "daily-")? {
        return Ok(());
    }
    let mut guard = state.connection.lock().await;
    let connection = guard
        .as_mut()
        .ok_or_else(|| NativeError::Database("The database is restarting.".into()))?;
    vacuum_snapshot(connection, &state.path, "daily").await?;
    apply_retention(&state.path)
}

#[tauri::command]
pub async fn create_database_snapshot(
    state: State<'_, DatabaseState>,
) -> NativeResult<SnapshotInfo> {
    let mut guard = state.connection.lock().await;
    let connection = guard
        .as_mut()
        .ok_or_else(|| NativeError::Database("The database is restarting.".into()))?;
    let path = vacuum_snapshot(connection, &state.path, "manual").await?;
    apply_retention(&state.path)?;
    snapshot_info(&path)
}

#[tauri::command]
pub async fn list_database_snapshots(
    state: State<'_, DatabaseState>,
) -> NativeResult<Vec<SnapshotInfo>> {
    snapshot_paths(&state.path)?
        .iter()
        .map(|path| snapshot_info(path))
        .collect()
}

#[tauri::command]
pub async fn open_backup_folder(
    app: AppHandle,
    state: State<'_, DatabaseState>,
) -> NativeResult<()> {
    let directory = state
        .path
        .parent()
        .ok_or_else(|| NativeError::File("Database path has no parent directory.".into()))?
        .join("backups");
    std::fs::create_dir_all(&directory)?;
    app.opener()
        .open_path(directory.to_string_lossy().to_string(), None::<String>)
        .map_err(|error| NativeError::File(error.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn restore_database_snapshot(
    app: AppHandle,
    state: State<'_, DatabaseState>,
    request: RestoreSnapshotRequest,
) -> NativeResult<()> {
    let safe_name = Path::new(&request.name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| *value == request.name && value.ends_with(".sqlite3"))
        .ok_or_else(|| NativeError::File("Invalid snapshot name.".into()))?;
    let snapshot = database_backup_dir(&state.path)?.join(safe_name);
    if !snapshot.is_file() {
        return Err(NativeError::File("Database snapshot not found.".into()));
    }

    let mut guard = state.connection.lock().await;
    if let Some(mut connection) = guard.take() {
        connection
            .execute("PRAGMA wal_checkpoint(TRUNCATE)")
            .await?;
        connection.close().await?;
    }
    let safety =
        database_backup_dir(&state.path)?.join(format!("pre-restore-{}.sqlite3", timestamp()));
    std::fs::copy(&state.path, safety)?;
    std::fs::copy(snapshot, &state.path)?;
    let wal = PathBuf::from(format!("{}-wal", state.path.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", state.path.to_string_lossy()));
    if wal.exists() {
        std::fs::remove_file(wal)?;
    }
    if shm.exists() {
        std::fs::remove_file(shm)?;
    }
    app.restart();
}
