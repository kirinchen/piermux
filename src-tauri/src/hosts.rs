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
    /// tmux server socket 名(`tmux -L <socket>`)。預設 server 是 "default"。
    /// 同一 host 不同 socket 各是獨立 tmux server,session 名字空間分開(D-39)。
    pub socket: String,
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
    /// 遠端 tmux 執行檔(#225)。`None` = `tmux`(走 PATH)。Windows psmux 主機要填
    /// 真 exe 路徑(winget 的 symlink 在 ssh 的 session 0 下 Permission denied)。
    pub tmux_bin: Option<String>,
    /// 遠端 shell(#225)。`None` = 直接 exec(POSIX login shell,Linux 主機行為不變)。
    /// 有值 = 這台是 Windows / psmux 主機:非 PTY 指令改成 exec 這個 shell、腳本從 stdin
    /// 送進去(Windows OpenSSH 預設 shell 是 cmd,沒有 `sh -c`),並啟用 psmux 模式
    /// (不帶 `-L`、不從 ssh 建 session)。見 `is_psmux`。
    pub remote_shell: Option<String>,
}

impl Host {
    /// psmux 模式(#225):有設 `remote_shell` 就是 Windows 主機 —— 唯一需要包遠端
    /// shell 的理由就是登入 shell 不是 POSIX。
    pub fn is_psmux(&self) -> bool {
        self.remote_shell.is_some()
    }
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
    #[serde(default)]
    pub tmux_bin: Option<String>,
    #[serde(default)]
    pub remote_shell: Option<String>,
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
    migrate_capture_cache_socket(&pool).await?;
    migrate_hosts_mux_columns(&pool).await?;
    Ok(pool)
}

/// capture_cache 加 socket 維度的升級(D-39)。
/// 全新 DB:0001 已建含 socket 的 table → 這裡偵測到 socket 欄存在 → no-op。
/// 既有 DB:0001 `IF NOT EXISTS` 跳過舊 table → 這裡偵測無 socket → 重建。
/// capture_cache 是純快取(重新 capture 可重建),重建無損。
async fn migrate_capture_cache_socket(pool: &SqlitePool) -> Result<()> {
    use sqlx::Row;
    let cols = sqlx::query("PRAGMA table_info(capture_cache)")
        .fetch_all(pool)
        .await
        .context("PRAGMA table_info(capture_cache)")?;
    let has_socket = cols.iter().any(|r| r.get::<String, _>("name") == "socket");
    if has_socket {
        return Ok(());
    }
    // 重建:舊資料的 socket 一律補 'default'。
    for stmt in [
        "ALTER TABLE capture_cache RENAME TO capture_cache_old",
        "CREATE TABLE capture_cache (\
            host_id TEXT NOT NULL, \
            socket TEXT NOT NULL DEFAULT 'default', \
            session_name TEXT NOT NULL, \
            content TEXT NOT NULL, \
            captured_at TEXT NOT NULL, \
            PRIMARY KEY (host_id, socket, session_name))",
        "INSERT INTO capture_cache (host_id, socket, session_name, content, captured_at) \
            SELECT host_id, 'default', session_name, content, captured_at FROM capture_cache_old",
        "DROP TABLE capture_cache_old",
    ] {
        sqlx::query(stmt)
            .execute(pool)
            .await
            .with_context(|| format!("migrate capture_cache: {stmt}"))?;
    }
    Ok(())
}

/// hosts 加 `tmux_bin` / `remote_shell`(#225)。兩欄都 nullable、NULL = 舊行為,
/// 所以全新 / 既有 DB 一律缺哪欄補哪欄,舊資料不用動。
async fn migrate_hosts_mux_columns(pool: &SqlitePool) -> Result<()> {
    use sqlx::Row;
    let cols = sqlx::query("PRAGMA table_info(hosts)")
        .fetch_all(pool)
        .await
        .context("PRAGMA table_info(hosts)")?;
    let names: Vec<String> = cols.iter().map(|r| r.get::<String, _>("name")).collect();
    for col in ["tmux_bin", "remote_shell"] {
        if names.iter().any(|n| n == col) {
            continue;
        }
        sqlx::query(&format!("ALTER TABLE hosts ADD COLUMN {col} TEXT"))
            .execute(pool)
            .await
            .with_context(|| format!("add hosts.{col}"))?;
    }
    Ok(())
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
                              private_key_path, sort_order, created_at, last_used_at, \
                              tmux_bin, remote_shell";

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
                            auth_type, private_key_path, sort_order, created_at, \
                            tmux_bin, remote_shell) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    .bind(blank_to_none(&form.tmux_bin))
    .bind(blank_to_none(&form.remote_shell))
    .execute(pool)
    .await?;
    fetch_one(pool, &id).await
}

pub async fn update_host(pool: &SqlitePool, id: &str, form: &HostForm) -> Result<Host> {
    sqlx::query(
        "UPDATE hosts SET display_name = ?, ssh_host = ?, ssh_port = ?, ssh_user = ?, \
                          auth_type = ?, private_key_path = ?, sort_order = ?, \
                          tmux_bin = ?, remote_shell = ? \
         WHERE id = ?",
    )
    .bind(&form.display_name)
    .bind(&form.ssh_host)
    .bind(form.ssh_port)
    .bind(&form.ssh_user)
    .bind(&form.auth_type)
    .bind(&form.private_key_path)
    .bind(form.sort_order)
    .bind(blank_to_none(&form.tmux_bin))
    .bind(blank_to_none(&form.remote_shell))
    .bind(id)
    .execute(pool)
    .await?;
    fetch_one(pool, id).await
}

/// 表單空字串當沒填(NULL = 舊行為),前後空白也去掉。
fn blank_to_none(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
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
