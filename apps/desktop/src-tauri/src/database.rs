use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteRow};
use sqlx::{Column, Connection, Row, Sqlite, SqliteConnection, Transaction, TypeInfo, ValueRef};
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::error::{NativeError, NativeResult};

static MIGRATOR: sqlx::migrate::Migrator =
    sqlx::migrate!("../../../packages/local-store/migrations");


pub struct DatabaseState {
    pub connection: Mutex<Option<SqliteConnection>>,
    pub path: PathBuf,
    pub startup_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    ready: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRequest {
    pub statement: String,
    #[serde(default)]
    pub parameters: Vec<JsonValue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicStatement {
    pub statement: String,
    #[serde(default)]
    pub parameters: Vec<JsonValue>,
    pub method: QueryMethod,
    pub expected_rows_affected: Option<u64>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QueryMethod {
    Run,
    All,
    Get,
    Values,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseResult {
    pub rows: Vec<Vec<JsonValue>>,
    pub rows_affected: u64,
    pub last_insert_id: Option<i64>,
}

impl DatabaseResult {
    fn rows(rows: Vec<Vec<JsonValue>>) -> Self {
        Self {
            rows,
            rows_affected: 0,
            last_insert_id: None,
        }
    }
}

pub async fn initialize(app: &AppHandle) -> NativeResult<DatabaseState> {
    #[cfg(debug_assertions)]
    let data_dir = if let Some(path) = std::env::var_os("SKRIV_DATA_DIR") {
        PathBuf::from(path)
    } else {
        app.path()
            .local_data_dir()
            .map_err(|error| NativeError::File(error.to_string()))?
            .join("Skriv")
    };
    #[cfg(not(debug_assertions))]
    let data_dir = app
        .path()
        .local_data_dir()
        .map_err(|error| NativeError::File(error.to_string()))?
        .join("Skriv");
    std::fs::create_dir_all(&data_dir)?;
    let path = data_dir.join("skriv.sqlite3");
    let result = initialize_connection(&path).await;
    let (connection, startup_error) = match result {
        Ok(connection) => (Some(connection), None),
        Err(error) => (None, Some(error.to_string())),
    };

    Ok(DatabaseState {
        connection: Mutex::new(connection),
        path,
        startup_error,
    })
}

async fn initialize_connection(path: &std::path::Path) -> NativeResult<SqliteConnection> {
    let had_database = std::fs::metadata(path)
        .map(|metadata| metadata.len() > 0)
        .unwrap_or(false);
    let url = format!("sqlite:{}", path.to_string_lossy().replace('\\', "/"));
    let options = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    let mut connection = SqliteConnection::connect_with(&options).await?;

    sqlx::query("PRAGMA synchronous = NORMAL")
        .execute(&mut connection)
        .await?;
    let installed_version = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
    )
    .fetch_one(&mut connection)
    .await
    .unwrap_or(0);
    let latest_version = MIGRATOR
        .migrations
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or(0);
    crate::backups::initialize_database_snapshots(
        &mut connection,
        path,
        had_database,
        latest_version > installed_version,
    )
    .await?;
    MIGRATOR.run(&mut connection).await?;

    Ok(connection)
}

#[tauri::command]
pub fn database_status(state: State<'_, DatabaseState>) -> DatabaseStatus {
    DatabaseStatus {
        ready: state.startup_error.is_none(),
        error: state.startup_error.clone(),
    }
}

fn bind_json<'q>(
    mut query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    values: &'q [JsonValue],
) -> NativeResult<sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>> {
    for value in values {
        query = match value {
            JsonValue::Null => query.bind(Option::<String>::None),
            JsonValue::Bool(value) => query.bind(*value),
            JsonValue::Number(value) if value.is_i64() => query.bind(value.as_i64()),
            JsonValue::Number(value) if value.is_u64() => {
                let integer = i64::try_from(value.as_u64().unwrap_or_default()).map_err(|_| {
                    NativeError::Database("Integer parameter exceeds SQLite range.".into())
                })?;
                query.bind(integer)
            }
            JsonValue::Number(value) => query.bind(value.as_f64()),
            JsonValue::String(value) => query.bind(value),
            JsonValue::Array(_) | JsonValue::Object(_) => query.bind(serde_json::to_string(value)?),
        };
    }
    Ok(query)
}

fn sqlite_value(row: &SqliteRow, index: usize) -> NativeResult<JsonValue> {
    let raw = row.try_get_raw(index)?;
    if raw.is_null() {
        return Ok(JsonValue::Null);
    }

    let type_name = row.columns()[index].type_info().name();
    match type_name {
        "INTEGER" | "INT" | "BOOLEAN" => Ok(JsonValue::from(row.try_get::<i64, _>(index)?)),
        "REAL" | "FLOAT" | "DOUBLE" => Ok(JsonValue::from(row.try_get::<f64, _>(index)?)),
        "BLOB" => {
            let bytes = row.try_get::<Vec<u8>, _>(index)?;
            Ok(JsonValue::Array(
                bytes.into_iter().map(JsonValue::from).collect(),
            ))
        }
        _ => Ok(JsonValue::from(row.try_get::<String, _>(index)?)),
    }
}

fn rows_to_json(rows: Vec<SqliteRow>) -> NativeResult<Vec<Vec<JsonValue>>> {
    rows.into_iter()
        .map(|row| {
            (0..row.len())
                .map(|index| sqlite_value(&row, index))
                .collect::<NativeResult<Vec<_>>>()
        })
        .collect()
}

async fn execute_on(
    connection: &mut SqliteConnection,
    request: &DatabaseRequest,
) -> NativeResult<DatabaseResult> {
    let query = bind_json(sqlx::query(&request.statement), &request.parameters)?;
    let result = query.execute(connection).await?;
    Ok(DatabaseResult {
        rows: Vec::new(),
        rows_affected: result.rows_affected(),
        last_insert_id: Some(result.last_insert_rowid()),
    })
}

async fn query_on(
    connection: &mut SqliteConnection,
    request: &DatabaseRequest,
) -> NativeResult<DatabaseResult> {
    let query = bind_json(sqlx::query(&request.statement), &request.parameters)?;
    let rows = query.fetch_all(connection).await?;
    Ok(DatabaseResult::rows(rows_to_json(rows)?))
}

async fn atomic_item(
    transaction: &mut Transaction<'_, Sqlite>,
    item: &AtomicStatement,
) -> NativeResult<DatabaseResult> {
    let request = DatabaseRequest {
        statement: item.statement.clone(),
        parameters: item.parameters.clone(),
    };
    match item.method {
        QueryMethod::Run => {
            let query = bind_json(sqlx::query(&request.statement), &request.parameters)?;
            let result = query.execute(&mut **transaction).await?;
            if let Some(expected) = item.expected_rows_affected {
                if result.rows_affected() != expected {
                    return Err(NativeError::Conflict(format!(
                        "Expected {expected} affected rows, received {}.",
                        result.rows_affected()
                    )));
                }
            }
            Ok(DatabaseResult {
                rows: Vec::new(),
                rows_affected: result.rows_affected(),
                last_insert_id: Some(result.last_insert_rowid()),
            })
        }
        QueryMethod::All | QueryMethod::Get | QueryMethod::Values => {
            let query = bind_json(sqlx::query(&request.statement), &request.parameters)?;
            let rows = query.fetch_all(&mut **transaction).await?;
            if let Some(expected) = item.expected_rows_affected {
                if rows.len() as u64 != expected {
                    return Err(NativeError::Conflict(format!(
                        "Expected {expected} returned rows, received {}.",
                        rows.len()
                    )));
                }
            }
            Ok(DatabaseResult::rows(rows_to_json(rows)?))
        }
    }
}

#[tauri::command]
pub async fn db_query(
    state: State<'_, DatabaseState>,
    request: DatabaseRequest,
) -> NativeResult<DatabaseResult> {
    let mut connection = state.connection.lock().await;
    let connection = connection
        .as_mut()
        .ok_or_else(|| NativeError::Database("The database is restarting.".into()))?;
    query_on(connection, &request).await
}

#[tauri::command]
pub async fn db_execute(
    state: State<'_, DatabaseState>,
    request: DatabaseRequest,
) -> NativeResult<DatabaseResult> {
    let mut connection = state.connection.lock().await;
    let connection = connection
        .as_mut()
        .ok_or_else(|| NativeError::Database("The database is restarting.".into()))?;
    execute_on(connection, &request).await
}

#[tauri::command]
pub async fn db_atomic(
    state: State<'_, DatabaseState>,
    statements: Vec<AtomicStatement>,
) -> NativeResult<Vec<DatabaseResult>> {
    let mut connection = state.connection.lock().await;
    let connection = connection
        .as_mut()
        .ok_or_else(|| NativeError::Database("The database is restarting.".into()))?;
    let mut transaction = connection.begin().await?;
    let mut results = Vec::with_capacity(statements.len());
    for statement in &statements {
        results.push(atomic_item(&mut transaction, statement).await?);
    }
    transaction.commit().await?;
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn memory_database() -> SqliteConnection {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("valid memory URL")
            .foreign_keys(true);
        SqliteConnection::connect_with(&options)
            .await
            .expect("memory database")
    }

    #[tokio::test]
    async fn expected_row_conflict_rolls_back_the_whole_transaction() {
        let mut connection = memory_database().await;
        sqlx::query("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&mut connection)
            .await
            .expect("create table");
        let mut transaction = connection.begin().await.expect("transaction");
        let insert = AtomicStatement {
            statement: "INSERT INTO items (id, value) VALUES (?, ?)".into(),
            parameters: vec![json!(1), json!("draft")],
            method: QueryMethod::Run,
            expected_rows_affected: Some(1),
        };
        atomic_item(&mut transaction, &insert)
            .await
            .expect("insert succeeds");
        let stale = AtomicStatement {
            statement: "UPDATE items SET value = ? WHERE id = ? RETURNING id".into(),
            parameters: vec![json!("saved"), json!(99)],
            method: QueryMethod::All,
            expected_rows_affected: Some(1),
        };
        assert!(matches!(
            atomic_item(&mut transaction, &stale).await,
            Err(NativeError::Conflict(_))
        ));
        transaction.rollback().await.expect("rollback");
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(&mut connection)
            .await
            .expect("count rows");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn compiled_migrations_enable_foreign_key_cascades() {
        let mut connection = memory_database().await;
        sqlx::migrate!("../../../packages/local-store/migrations")
            .run(&mut connection)
            .await
            .expect("migrations run");
        sqlx::query("INSERT INTO projects (id, title, settings) VALUES ('p', 'Story', '{}')")
            .execute(&mut connection)
            .await
            .expect("project");
        sqlx::query("INSERT INTO acts (id, project_id, title, position) VALUES ('a', 'p', '', 0)")
            .execute(&mut connection)
            .await
            .expect("act");
        sqlx::query("INSERT INTO chapters (id, act_id, title, position) VALUES ('c', 'a', '', 0)")
            .execute(&mut connection)
            .await
            .expect("chapter");
        sqlx::query("INSERT INTO scenes (id, chapter_id, title, position, document, metadata) VALUES ('s', 'c', '', 0, '{}', '{}')")
            .execute(&mut connection)
            .await
            .expect("scene");
        sqlx::query("DELETE FROM projects WHERE id = 'p'")
            .execute(&mut connection)
            .await
            .expect("delete project");
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM scenes")
            .fetch_one(&mut connection)
            .await
            .expect("count scenes");
        assert_eq!(count, 0);
    }
}
