// M1d capture commands(SPEC §3.3 三層 refresh + §6.3)。
//
// - capture_session(host, session)        — 單一 session
// - capture_host(host)                    — host 內所有 session,host 內並發 ≤ 3(SPEC §9.2)
// - capture_all()                         — 所有 host 並行(host 之間不阻塞)
//
// 每個成功 capture 都會:
// 1. UPSERT 進 `capture_cache` table
// 2. emit Tauri event `capture-updated:<host_id>:<session_name>`(payload = CaptureResult)
//
// 失敗策略:
// - 個別 session capture 失敗 → eprintln 後跳過,不影響同 host 其他 session
// - 整 host list_sessions / connect 失敗(SSH 不通)→ capture_host 回 Err;
//   capture_all 內部 swallow,讓其他 host 照跑(對齊 SPEC §3.3「失敗 host 標 ⚠ 不影響其他」)
//
// SSH 連線策略(SPEC §9.2):
// - capture_session:單一 session → 用 `ssh::run_command`(1 connect, 1 exec)
// - capture_host:**一個 host 一條 SSH connection**,在這條 connection 上跑
//   list-sessions + N 個 capture-pane channel,用 `Semaphore(3)` 限速
// - capture_all:對每 host 各自開 1 條 SSH 並行;host 之間 fully parallel

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::Serialize;
use sqlx::sqlite::SqlitePool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Semaphore;

use crate::hosts::{self, Host};
use crate::sessions;
use crate::ssh::{self, SshSession};

const HOST_CONCURRENCY: usize = 3;

/// `tmux capture-pane -S -<N>`:從目前可見區往上抓 N 行 scrollback。
/// 2000 行對 AI agent session 夠用(一個 turn 100~500 行,2000 行 ≈ 4~20 個 turn);
/// SSH 傳輸量 ~200KB / session,LAN 無感;xterm scrollback 上限 5000,留餘裕。
/// 需要更多歷史請走 attach + tmux copy mode(`prefix [`)。
const TMUX_CAPTURE_LINES: usize = 2000;

/// 對齊 SPEC §6.3 回傳。`content` 含 ANSI escape codes(`tmux capture-pane -e`)。
#[derive(Debug, Serialize, Clone)]
pub struct CaptureResult {
    pub host_id: String,
    pub session_name: String,
    pub content: String,
    pub captured_at: String, // RFC3339
}

#[tauri::command]
pub async fn capture_session(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    host_id: String,
    session_name: String,
) -> Result<CaptureResult, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let result = capture_one(&host, &session_name)
        .await
        .map_err(|e| e.to_string())?;
    write_cache(pool.inner(), &result)
        .await
        .map_err(|e| e.to_string())?;
    emit_capture(&app, &result).map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn capture_host(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    host_id: String,
) -> Result<Vec<CaptureResult>, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    capture_host_inner(&app, pool.inner(), host)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn capture_all(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CaptureResult>, String> {
    let host_list = hosts::list_hosts(pool.inner())
        .await
        .map_err(|e| format!("list hosts: {e}"))?;
    let pool_owned: SqlitePool = pool.inner().clone();

    let mut handles = Vec::with_capacity(host_list.len());
    for host in host_list {
        let app_clone = app.clone();
        let pool_clone = pool_owned.clone();
        let host_label = host.display_name.clone();
        handles.push(tokio::spawn(async move {
            (
                host_label.clone(),
                capture_host_inner(&app_clone, &pool_clone, host).await,
            )
        }));
    }

    let mut all = Vec::new();
    for h in handles {
        match h.await {
            Ok((_, Ok(results))) => all.extend(results),
            Ok((label, Err(e))) => {
                eprintln!("[capture_all] host '{label}' failed: {e}");
            }
            Err(e) => eprintln!("[capture_all] task join error: {e}"),
        }
    }
    Ok(all)
}

// ---- 內部 helpers ----

async fn capture_host_inner(
    app: &AppHandle,
    pool: &SqlitePool,
    host: Host,
) -> Result<Vec<CaptureResult>> {
    // 1. 一個 host 一條 SSH connection(SPEC §9.2)
    let password = sessions::read_password_for(&host)?;
    let auth = sessions::build_auth(&host, password.as_deref())?;
    let port = sessions::port_u16(&host)?;
    let ssh_session = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth)
        .await
        .with_context(|| format!("ssh connect to {}", host.display_name))?;
    let ssh_session = Arc::new(ssh_session);

    // 2. 在同一條 connection 跑 list-sessions
    let list_stdout = ssh_session
        .exec(sessions::TMUX_LIST_FMT)
        .await
        .with_context(|| format!("list sessions on {}", host.display_name))?;
    let session_list = sessions::parse_sessions(&list_stdout)
        .with_context(|| format!("parse session list on {}", host.display_name))?;

    // 3. 同一條 connection 跑 N 個 capture-pane channel,Semaphore(3) 限速
    let semaphore = Arc::new(Semaphore::new(HOST_CONCURRENCY));
    let mut handles = Vec::with_capacity(session_list.len());

    for s in session_list {
        let ssh_clone = ssh_session.clone();
        let host_clone = host.clone();
        let session_name = s.name;
        let semaphore_clone = semaphore.clone();
        let app_clone = app.clone();
        let pool_clone = pool.clone();
        handles.push(tokio::spawn(async move {
            let _permit = match semaphore_clone.acquire_owned().await {
                Ok(p) => p,
                Err(_) => return None, // semaphore 不會被 close,實務上不會走這
            };
            match capture_via_session(&ssh_clone, &host_clone, &session_name).await {
                Ok(result) => {
                    if let Err(e) = write_cache(&pool_clone, &result).await {
                        eprintln!(
                            "[capture_host] write_cache {}/{} failed: {e}",
                            host_clone.display_name, session_name
                        );
                    }
                    if let Err(e) = emit_capture(&app_clone, &result) {
                        eprintln!(
                            "[capture_host] emit {}/{} failed: {e}",
                            host_clone.display_name, session_name
                        );
                    }
                    Some(result)
                }
                Err(e) => {
                    eprintln!(
                        "[capture_host] capture {}/{} failed: {e}",
                        host_clone.display_name, session_name
                    );
                    None
                }
            }
        }));
    }

    let mut results = Vec::new();
    for h in handles {
        if let Ok(Some(r)) = h.await {
            results.push(r);
        }
    }
    // 所有 task 跑完(不管成功失敗)後 Arc count 歸零 → SshSession Drop → drive abort
    drop(ssh_session);
    Ok(results)
}

/// 在已連好的 SshSession 上跑 capture-pane,組 CaptureResult。
/// 給 capture_host_inner 內部 task 用,免得每個 task 都重新 ssh::connect。
async fn capture_via_session(
    ssh_session: &SshSession,
    host: &Host,
    session_name: &str,
) -> Result<CaptureResult> {
    let cmd = format!(
        "tmux capture-pane -t {}:0 -p -e -S -{}",
        shell_quote(session_name),
        TMUX_CAPTURE_LINES,
    );
    let stdout = ssh_session.exec(&cmd).await.with_context(|| {
        format!(
            "capture-pane '{}' on host {}",
            session_name, host.display_name
        )
    })?;
    Ok(CaptureResult {
        host_id: host.id.clone(),
        session_name: session_name.to_string(),
        content: stdout,
        captured_at: Utc::now().to_rfc3339(),
    })
}

async fn capture_one(host: &Host, session_name: &str) -> Result<CaptureResult> {
    let password = sessions::read_password_for(host)?;
    let auth = sessions::build_auth(host, password.as_deref())?;
    let port = sessions::port_u16(host)?;

    // -p 印到 stdout / -e 含 ANSI escape codes / -S -<N> 從往回 N 行起
    let cmd = format!(
        "tmux capture-pane -t {}:0 -p -e -S -{}",
        shell_quote(session_name),
        TMUX_CAPTURE_LINES,
    );

    let stdout = ssh::run_command(&host.ssh_host, port, &host.ssh_user, auth, &cmd)
        .await
        .with_context(|| {
            format!(
                "capture-pane '{}' on host {}",
                session_name, host.display_name
            )
        })?;

    Ok(CaptureResult {
        host_id: host.id.clone(),
        session_name: session_name.to_string(),
        content: stdout,
        captured_at: Utc::now().to_rfc3339(),
    })
}

async fn write_cache(pool: &SqlitePool, r: &CaptureResult) -> Result<()> {
    sqlx::query(
        "INSERT INTO capture_cache (host_id, session_name, content, captured_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(host_id, session_name) DO UPDATE SET \
             content = excluded.content, \
             captured_at = excluded.captured_at",
    )
    .bind(&r.host_id)
    .bind(&r.session_name)
    .bind(&r.content)
    .bind(&r.captured_at)
    .execute(pool)
    .await?;
    Ok(())
}

fn emit_capture(app: &AppHandle, r: &CaptureResult) -> Result<()> {
    // SPEC §6.3:event name `capture-updated:<host_id>:<session_name>`。
    // host_id 是 UUID v4(不含 ':');tmux session name 也禁止含 ':' ($man tmux 對 target spec 的限制)
    // 所以 frontend listener 用 exact name match 安全。
    let evt = format!("capture-updated:{}:{}", r.host_id, r.session_name);
    app.emit(&evt, r).map_err(|e| anyhow!("emit {evt}: {e}"))?;
    Ok(())
}

/// POSIX shell 單引號逃脫。session_name 是使用者可控的字串(從 tmux 那邊回來
/// 的,通常乾淨,但保險起見還是 quote)。
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
