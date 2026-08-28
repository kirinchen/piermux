// 檔案上傳(D-40):把本地檔 bytes 寫進 remote tmux pane 的當前工作目錄。
//
// - 目標路徑 = `#{pane_current_path}`(該 session window 0 active pane 的活 cwd)
//   + 檔名。走剛做好的 socket infra(`tmux -L <socket>`)。
// - 傳輸走 `ssh::SshSession::upload`(exec `cat > <path>`,makiko 沒 SFTP,D-40)。
// - **只支援 tmux target**:shell target(直連 login shell)沒有可查的活 cwd
//   (登入後 `cd` 我們追蹤不到),前端不給 shell 開上傳。
// - 同名檔直接覆蓋(對齊「丟到 pwd」的最簡語意,owner 拍板)。
// - desktop 拖放給的是**本地檔案路徑**,後端自己 `std::fs::read` — IPC 不用扛
//   整包 bytes(大檔友善)。Android(content:// 沒真路徑)是第二刀,走別的入口。

use anyhow::{bail, Context, Result};
use sqlx::sqlite::SqlitePool;
use tauri::State;

use crate::hosts;
use crate::sessions;
use crate::ssh::{self, HostKeyPolicy};

/// 單檔上限 512MB — 純防呆(整檔讀進記憶體;真要傳巨檔該走別的機制)。
const MAX_UPLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[tauri::command]
pub async fn upload_to_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
    local_path: String,
) -> Result<String, String> {
    upload_inner(pool.inner(), &host_id, &socket, &session_name, &local_path)
        .await
        .map_err(|e| e.to_string())
}

async fn upload_inner(
    pool: &SqlitePool,
    host_id: &str,
    socket: &str,
    session_name: &str,
    local_path: &str,
) -> Result<String> {
    // 只取 basename,擋掉檔名裡的路徑成分(`../` / 絕對路徑)污染目標位置
    let base = basename(local_path);
    if base.is_empty() {
        bail!("檔名不合法:{local_path}");
    }

    // 先確認是一般檔 + 大小防呆,再整檔讀進來
    let meta = std::fs::metadata(local_path)
        .with_context(|| format!("讀不到本地檔:{local_path}"))?;
    if !meta.is_file() {
        bail!("不是一般檔案:{local_path}");
    }
    if meta.len() > MAX_UPLOAD_BYTES {
        bail!("檔案過大(>{}MB):{local_path}", MAX_UPLOAD_BYTES / 1024 / 1024);
    }
    let data = std::fs::read(local_path).with_context(|| format!("讀本地檔:{local_path}"))?;

    let host = hosts::fetch_one(pool, host_id).await.context("fetch host")?;
    let password = sessions::read_password_for(&host)?;
    let auth = sessions::build_auth(&host, password.as_deref())?;
    let port = sessions::port_u16(&host)?;
    let policy = HostKeyPolicy::Tofu { pool, host_id };
    let ssh_session = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth, policy)
        .await
        .with_context(|| format!("ssh connect to {}", host.display_name))?;

    // 1. 拿 pane current path(window 0 active pane 的活 cwd)
    let pwd_cmd = format!(
        "{} display-message -p -t {}:0 '#{{pane_current_path}}'",
        sessions::tmux_with_socket(socket),
        shell_quote(session_name),
    );
    let pwd_raw = ssh_session
        .exec(&pwd_cmd)
        .await
        .with_context(|| format!("get pane_current_path of '{session_name}'"))?;
    let pwd = pwd_raw.trim();
    if pwd.is_empty() {
        // tmux 太舊沒這變數 / session 不存在 → 不要退回根目錄亂丟
        bail!("拿不到 session '{session_name}' 的 current path(tmux 版本太舊或 session 不存在)");
    }

    // 2. 組完整遠端路徑 + shell-quote
    let remote_path = format!("{pwd}/{base}");
    let remote_q = shell_quote(&remote_path);

    // 3. 上傳
    ssh_session
        .upload(&remote_q, &data)
        .await
        .with_context(|| format!("upload '{base}' → {}:{remote_path}", host.display_name))?;

    Ok(remote_path)
}

/// 取路徑最後一段(`/` 與 `\` 都當分隔,涵蓋 Windows 端拖來的檔名)。
fn basename(name: &str) -> &str {
    name.rsplit(['/', '\\']).next().unwrap_or(name).trim()
}

/// POSIX shell 單引號逃脫(同 capture.rs / attach.rs / messaging.rs 各自的 shell_quote)。
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
