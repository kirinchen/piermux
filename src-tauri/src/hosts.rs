use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;
use uuid::Uuid;

const SCHEMA_SQL: &str = include_str!("../migrations/0001_initial.sql");

// 對齊 SPEC §6.2 list_sessions 回傳。M1c 是 mock,M1d 開始真的接 SSH。
#[derive(Debug, Serialize, Clone)]
pub struct Session {
    pub name: String,
    pub attached: bool,
    pub activity: String, // RFC3339,frontend format 成相對時間
    pub windows: i64,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HostConnectionStatus {
    Connected,
    Disconnected,
    // M1c mock 直接回 connected/disconnected,沒有過渡 — 這個 variant
    // 是給未來 async test_connection 中間態用(M1d+ 真連線時 UI 顯示 spinner)
    #[allow(dead_code)]
    Connecting,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Host {
    pub id: String,
    pub display_name: String,
    pub ssh_host: String,
    pub ssh_port: i64,
    pub ssh_user: String,
    pub auth_type: String,
    pub private_key_path: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HostForm {
    pub display_name: String,
    pub ssh_host: String,
    #[serde(default = "default_port")]
    pub ssh_port: i64,
    pub ssh_user: String,
    pub auth_type: String,
    pub private_key_path: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub sort_order: i64,
}

fn default_port() -> i64 {
    22
}

pub async fn open_pool(db_path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create dir {parent:?}"))?;
    }
    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .with_context(|| format!("connect sqlite at {url}"))?;
    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await?;
    apply_schema(&pool).await?;
    Ok(pool)
}

async fn apply_schema(pool: &SqlitePool) -> Result<()> {
    // 先逐行 strip `--` 註解(否則 split(';') 第一個 chunk 會是「leading
    // 註解 + 第一個 CREATE TABLE」,starts_with("--") 把整個 chunk 含
    // CREATE TABLE 一起跳掉 → hosts 永遠沒建)
    let cleaned: String = SCHEMA_SQL
        .lines()
        .filter(|l| !l.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");

    for stmt in cleaned.split(';') {
        let s = stmt.trim();
        if s.is_empty() {
            continue;
        }
        sqlx::query(s)
            .execute(pool)
            .await
            .with_context(|| format!("apply schema stmt: {s}"))?;
    }
    Ok(())
}

const SELECT_COLUMNS: &str = "id, display_name, ssh_host, ssh_port, ssh_user, auth_type, \
                              private_key_path, sort_order, created_at, last_used_at";

pub async fn list_hosts(pool: &SqlitePool) -> Result<Vec<Host>> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM hosts ORDER BY sort_order, display_name");
    let rows = sqlx::query_as::<_, Host>(&sql).fetch_all(pool).await?;
    Ok(rows)
}

pub async fn create_host(pool: &SqlitePool, form: &HostForm) -> Result<Host> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO hosts (id, display_name, ssh_host, ssh_port, ssh_user, \
                            auth_type, private_key_path, sort_order, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&form.display_name)
    .bind(&form.ssh_host)
    .bind(form.ssh_port)
    .bind(&form.ssh_user)
    .bind(&form.auth_type)
    .bind(&form.private_key_path)
    .bind(form.sort_order)
    .bind(&now)
    .execute(pool)
    .await?;
    fetch_one(pool, &id).await
}

pub async fn update_host(pool: &SqlitePool, id: &str, form: &HostForm) -> Result<Host> {
    sqlx::query(
        "UPDATE hosts SET display_name = ?, ssh_host = ?, ssh_port = ?, ssh_user = ?, \
                          auth_type = ?, private_key_path = ?, sort_order = ? \
         WHERE id = ?",
    )
    .bind(&form.display_name)
    .bind(&form.ssh_host)
    .bind(form.ssh_port)
    .bind(&form.ssh_user)
    .bind(&form.auth_type)
    .bind(&form.private_key_path)
    .bind(form.sort_order)
    .bind(id)
    .execute(pool)
    .await?;
    fetch_one(pool, id).await
}

pub async fn delete_host(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM hosts WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// 留給 M1f attach 成功後 call(SPEC §3.1 tree view 顯示「last activity」要這個欄位)
#[allow(dead_code)]
pub async fn touch_last_used(pool: &SqlitePool, id: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE hosts SET last_used_at = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn fetch_one(pool: &SqlitePool, id: &str) -> Result<Host> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM hosts WHERE id = ?");
    let host = sqlx::query_as::<_, Host>(&sql)
        .bind(id)
        .fetch_one(pool)
        .await?;
    Ok(host)
}
