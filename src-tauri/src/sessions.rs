// 真實 list_sessions / host_status —— 取代 sessions_mock.rs。
// 用 SSH exec `tmux list-sessions -F '...'` 拿格式化輸出再 parse。
//
// 也擺 SPEC §6.6 的 kill_session、加 rename_session(SPEC 沒列但 §10 也沒禁,
// tree view session-level UX 配套)— 兩個都走 one-shot run_on_host,跟
// list_sessions / host_status 同 module 對齊「對 tmux 控制面」的東西放這。

use anyhow::{anyhow, bail, Context, Result};
use chrono::DateTime;
use sqlx::sqlite::SqlitePool;
use std::path::Path;
use tauri::State;

use crate::hosts::{self, Host, HostConnectionStatus, Session};
use crate::secret;
use crate::ssh::{self, AuthMaterial, HostKeyPolicy};

/// 掃 host 上**所有** tmux socket(`tmux -L <name>`)再逐一 list-sessions。
/// socket 名 = `${TMUX_TMPDIR:-/tmp/tmux-<uid>}/` 下的檔名(預設 server 叫 `default`)。
/// 死掉 / 沒 server 的 socket → `list-sessions` 報錯被 `2>/dev/null` 吞,該 socket 無輸出行。
/// 每行 5 欄:socket|name|attached|activity|windows(socket 放行首,parse 時 splitn(5))。
/// 只多 parse,不多一趟 SSH round-trip(整段是一條 exec)。D-39。
/// 結尾 `; true`：`for` 的 exit status = 最後一次迭代，目錄裡最後一個 socket 若是死的整段會 exit 1；
/// D-47 的 russh `run_command` 把非 0 當 Err，明明有正常輸出卻整個失敗（owner v0.1.23 Windows 實測）。
/// 死 socket 本來就是「吞掉略過」，exit code 不該由它決定。
pub(crate) const TMUX_LIST_FMT: &str = "d=\"${TMUX_TMPDIR:-/tmp/tmux-$(id -u)}\"; \
     for s in $(ls -1 \"$d\" 2>/dev/null); do \
       tmux -L \"$s\" list-sessions \
         -F \"$s|#{session_name}|#{session_attached}|#{session_activity}|#{session_windows}\" \
         2>/dev/null; \
     done; true";

#[tauri::command]
pub async fn list_sessions(
    pool: State<'_, SqlitePool>,
    host_id: String,
) -> Result<Vec<Session>, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    list_sessions_for(pool.inner(), &host)
        .await
        .map_err(|e| e.to_string())
}

/// Backend helper:給已知的 Host 跑 `tmux list-sessions`,parse 回 Vec<Session>。
/// `list_sessions` Tauri command 跟 capture.rs 共用。
pub(crate) async fn list_sessions_for(pool: &SqlitePool, host: &Host) -> Result<Vec<Session>> {
    let ssh = connect_host(pool, host).await?;
    let stdout = ssh.exec(&list_script(host)).await?;
    parse_sessions(&stdout)
}

/// 這台主機的 list-sessions 腳本。tmux:掃所有 socket(`TMUX_LIST_FMT`)。
/// psmux(#225):每個 session 是自己的 server,`-L default` 反而找不到 ——
/// 不帶 `-L` 直接列就是全部,socket 欄一律標 `default`(之後各操作也不帶 `-L`,
/// 見 `tmux_cmd`)。沒 server 時 psmux exit 1,一樣靠 `; true` 收掉。
pub(crate) fn list_script(host: &Host) -> String {
    if !host.is_psmux() {
        return TMUX_LIST_FMT.to_string();
    }
    format!(
        "{} list-sessions -F \"default|#{{session_name}}|#{{session_attached}}|#{{session_activity}}|#{{session_windows}}\" 2>/dev/null; true",
        tmux_bin(host)
    )
}

/// 連上這台主機(auth + TOFU),並依主機設定帶好 `remote_shell`(#225)。
/// 非 PTY 的指令都該走這個連出來的 session,Windows 主機才會經過遠端 shell。
pub(crate) async fn connect_host(pool: &SqlitePool, host: &Host) -> Result<ssh::SshSession> {
    let password = read_password_for(host)?;
    let auth = build_auth(host, password.as_deref())?;
    let port = port_u16(host)?;
    let policy = HostKeyPolicy::Tofu {
        pool,
        host_id: &host.id,
    };
    let session = ssh::connect(&host.ssh_host, port, &host.ssh_user, auth, policy).await?;
    Ok(session.with_remote_shell(host.remote_shell.clone()))
}

/// one-shot:連 + 跑一條指令(會經過 remote_shell)。
pub(crate) async fn run_on_host(pool: &SqlitePool, host: &Host, cmd: &str) -> Result<String> {
    connect_host(pool, host).await?.exec(cmd).await
}

#[tauri::command]
pub async fn kill_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
) -> Result<(), String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let cmd = format!(
        "{} kill-session -t {}",
        tmux_cmd(&host, &socket),
        shell_quote(&session_name)
    );
    run_tmux_control(pool.inner(), &host, &cmd)
        .await
        .with_context(|| format!("kill-session '{}' on {}", session_name, host.display_name))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn new_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
) -> Result<(), String> {
    let session_name = session_name.trim();
    if session_name.is_empty() {
        return Err("session name cannot be empty".into());
    }
    if session_name.contains([':', '.', ' ']) {
        return Err("session name cannot contain ':', '.' or whitespace".into());
    }
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    // psmux 主機也放行(D-50):psmux 靠 ~/.psmux/<name>.port 找 session,不分 Windows
    // session,ssh 建的 session 桌面一樣列得到、attach 得進去;只是裡面起的 GUI 程式不會顯示在桌面。
    // -d:detached(不要 attach,我們只是建出來);-s:session name
    let cmd = format!(
        "{} new-session -d -s {}",
        tmux_cmd(&host, &socket),
        shell_quote(session_name)
    );
    run_tmux_control(pool.inner(), &host, &cmd)
        .await
        .with_context(|| format!("new-session '{}' on {}", session_name, host.display_name))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_session(
    pool: State<'_, SqlitePool>,
    host_id: String,
    socket: String,
    session_name: String,
    new_name: String,
) -> Result<(), String> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("new session name cannot be empty".into());
    }
    if new_name.contains([':', '.', ' ']) {
        return Err("session name cannot contain ':', '.' or whitespace".into());
    }
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;
    let cmd = format!(
        "{} rename-session -t {} {}",
        tmux_cmd(&host, &socket),
        shell_quote(&session_name),
        shell_quote(new_name),
    );
    run_tmux_control(pool.inner(), &host, &cmd)
        .await
        .with_context(|| {
            format!(
                "rename-session '{}' → '{}' on {}",
                session_name, new_name, host.display_name
            )
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 共用 helper:跑一條沒輸出在乎的 tmux 控制指令(kill / rename / …)。
async fn run_tmux_control(pool: &SqlitePool, host: &Host, cmd: &str) -> Result<()> {
    run_on_host(pool, host, cmd).await?;
    Ok(())
}

/// POSIX shell 單引號逃脫(同 capture.rs / messaging.rs 各自的 shell_quote)。
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// 這台主機的 tmux 執行檔(已 quote 好可直接放進 POSIX 腳本)。沒設 = 裸 `tmux`。
pub(crate) fn tmux_bin(host: &Host) -> String {
    match host.tmux_bin.as_deref() {
        None => "tmux".to_string(),
        Some(bin) => shell_quote(bin),
    }
}

/// 帶 socket 的 tmux 指令前綴:`tmux -L '<socket>'`(D-39)。
/// 所有單 socket 操作(kill / rename / new / attach / capture / send)都用這個
/// 取代裸 `tmux`,才會打到對的 tmux server。socket 通常是 "default"。
/// psmux 主機(#225)不帶 `-L`:psmux 沒有 tmux 的 socket 目錄,`-L default` 會找不到 server。
pub(crate) fn tmux_cmd(host: &Host, socket: &str) -> String {
    if host.is_psmux() {
        tmux_bin(host)
    } else {
        format!("{} -L {}", tmux_bin(host), shell_quote(socket))
    }
}

#[tauri::command]
pub async fn host_status(
    pool: State<'_, SqlitePool>,
    host_id: String,
) -> Result<HostConnectionStatus, String> {
    let host = hosts::fetch_one(pool.inner(), &host_id)
        .await
        .map_err(|e| format!("fetch host: {e}"))?;

    let password = match read_password_for(&host) {
        Ok(p) => p,
        Err(_) => return Ok(HostConnectionStatus::Disconnected),
    };
    let auth = match build_auth(&host, password.as_deref()) {
        Ok(a) => a,
        Err(_) => return Ok(HostConnectionStatus::Disconnected),
    };
    let Ok(port) = port_u16(&host) else {
        return Ok(HostConnectionStatus::Disconnected);
    };

    // host_status 走 TOFU。第一次連線會綁 fingerprint;之後 fingerprint
    // mismatch 會出錯 → 顯示 disconnected(避免 silent fallback 到 MITM key)
    let policy = HostKeyPolicy::Tofu {
        pool: pool.inner(),
        host_id: &host.id,
    };
    let session = match ssh::connect(&host.ssh_host, port, &host.ssh_user, auth, policy).await {
        Ok(s) => s,
        Err(_) => return Ok(HostConnectionStatus::Disconnected),
    };
    match session.exec("whoami").await {
        Ok(_) => Ok(HostConnectionStatus::Connected),
        Err(_) => Ok(HostConnectionStatus::Disconnected),
    }
}

// ---- helpers(pub(crate) 給 capture.rs 共用)----

pub(crate) fn read_password_for(host: &Host) -> Result<Option<String>> {
    if host.auth_type == "password" {
        secret::read_password(&host.id).context("read keyring password")
    } else {
        Ok(None)
    }
}

pub(crate) fn build_auth<'a>(
    host: &'a Host,
    password: Option<&'a str>,
) -> Result<AuthMaterial<'a>> {
    match host.auth_type.as_str() {
        "password" => {
            let pw = password.ok_or_else(|| {
                anyhow!(
                    "password not in keyring for host {} — re-edit to set",
                    host.display_name
                )
            })?;
            Ok(AuthMaterial::Password(pw))
        }
        "key" => {
            let path = host
                .private_key_path
                .as_deref()
                .ok_or_else(|| anyhow!("private_key_path missing for key-auth host"))?;
            Ok(AuthMaterial::Key {
                path: Path::new(path),
                passphrase: None,
            })
        }
        other => bail!("unknown auth_type: {other}"),
    }
}

pub(crate) fn port_u16(host: &Host) -> Result<u16> {
    host.ssh_port
        .try_into()
        .map_err(|_| anyhow!("ssh_port out of range: {}", host.ssh_port))
}

pub(crate) fn parse_sessions(stdout: &str) -> Result<Vec<Session>> {
    stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() != 5 {
                bail!("unexpected tmux list-sessions line (expected 5 fields): {line}");
            }
            let attached = parts[2] != "0";
            let epoch: i64 = parts[3]
                .parse()
                .with_context(|| format!("parse activity epoch: {}", parts[3]))?;
            let activity = DateTime::from_timestamp(epoch, 0)
                .ok_or_else(|| anyhow!("invalid activity epoch: {epoch}"))?
                .to_rfc3339();
            let windows: i64 = parts[4]
                .parse()
                .with_context(|| format!("parse windows count: {}", parts[4]))?;
            Ok(Session {
                socket: parts[0].to_string(),
                name: parts[1].to_string(),
                attached,
                activity,
                windows,
            })
        })
        .collect()
}

/// psmux 主機真機測試(#225)。需要一台 Windows + psmux 的 sshd(key 登入),環境變數:
///   PIERMUX_PSMUX_TEST_HOST / _USER / _KEY / _BIN(psmux.exe,C:/ 正斜線)/ _SESSION(已存在的 session)
///   PIERMUX_PSMUX_TEST_SHELL(可選,預設 Git Bash)
/// 只讀 + 送空字串 + attach 後斷線:**不建、不殺 session**。
/// 跑法:`cargo test sessions::psmux_live -- --ignored --nocapture`。
#[cfg(test)]
mod psmux_live {
    use super::*;
    use crate::hosts::HostForm;

    struct Env {
        host: Host,
        session: String,
        pool: SqlitePool,
    }

    async fn env() -> Option<Env> {
        let var = |k: &str| std::env::var(format!("PIERMUX_PSMUX_TEST_{k}")).ok();
        let session = var("SESSION")?;
        let form = HostForm {
            display_name: "psmux-live".into(),
            ssh_host: var("HOST")?,
            ssh_port: 22,
            ssh_user: var("USER")?,
            auth_type: "key".into(),
            private_key_path: Some(var("KEY")?),
            password: None,
            sort_order: 0,
            tmux_bin: Some(var("BIN")?),
            remote_shell: Some(
                var("SHELL").unwrap_or_else(|| r#""C:\Program Files\Git\bin\bash.exe" -ls"#.into()),
            ),
        };
        let db = std::env::temp_dir().join(format!("piermux-psmux-live-{}.db", std::process::id()));
        let pool = hosts::open_pool(&db).await.expect("open pool");
        let host = hosts::create_host(&pool, &form).await.expect("create host");
        Some(Env {
            host,
            session,
            pool,
        })
    }

    #[tokio::test]
    #[ignore]
    async fn list_capture_send_attach() {
        let Some(e) = env().await else {
            eprintln!("PIERMUX_PSMUX_TEST_* 沒設,skip");
            return;
        };
        // ① list-sessions
        let list = list_sessions_for(&e.pool, &e.host).await.expect("list");
        eprintln!("① list: {list:?}");
        assert!(list
            .iter()
            .any(|s| s.name == e.session && s.socket == "default"));

        // ② capture-pane(跟 capture.rs 同一條指令)
        let tmux = tmux_cmd(&e.host, "default");
        let target = shell_quote(&e.session);
        let cap = run_on_host(
            &e.pool,
            &e.host,
            &format!("{tmux} capture-pane -t {target}:0 -p -e -S -20"),
        )
        .await
        .expect("capture");
        eprintln!("② capture {} bytes", cap.len());
        assert!(!cap.trim().is_empty());

        // ③ send-keys -l(空字串:驗指令 / 引號鏈路,不動到 pane 的輸入)
        run_on_host(
            &e.pool,
            &e.host,
            &format!("{tmux} send-keys -l -t {target} -- ''"),
        )
        .await
        .expect("send-keys");
        eprintln!("③ send-keys ok");

        // ④ PTY attach → 收畫面 → resize → 斷線(= detach,session 不受影響)
        let ssh = connect_host(&e.pool, &e.host).await.expect("connect");
        let mut pty = ssh.open_pty(120, 30).await.expect("pty");
        let cmd = format!(
            "\"{}\" attach -t \"{}\"",
            e.host.tmux_bin.as_deref().unwrap(),
            e.session
        );
        pty.exec(&cmd).await.expect("attach exec");
        let (mut rx, tx) = pty.into_parts();
        let mut got = 0usize;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(4);
        while let Ok(Some(msg)) = tokio::time::timeout_at(deadline, rx.wait()).await {
            if let ssh::PtyMsg::Data { data } = msg {
                got += data.len();
            }
        }
        tx.window_change(100, 25, 0, 0).await.expect("resize");
        tx.close().await.expect("close");
        eprintln!("④ attach 收到 {got} bytes");
        assert!(got > 1000, "attach 畫面太少:{got}");

        let after = list_sessions_for(&e.pool, &e.host)
            .await
            .expect("list after");
        assert!(after.iter().any(|s| s.name == e.session), "session 不見了");
    }
}
