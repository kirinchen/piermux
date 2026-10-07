// SSH client(russh 0.64 backend,D-47)。
//
// 歷史:SPEC §13 指定 russh;2026-04 時 russh 0.60 拉到的 ed25519-dalek
// 3.0.0-pre.6 跟新版 pkcs8 不容編不過(NOTES D-6),暫換 makiko(D-7)並留
// 「追上游」待辦。上游 ed25519-dalek 3.0.0 正式版已修,換回主流庫,makiko
// 單一維護者的 bus factor 風險一併解除。對外 API(connect / exec / upload /
// open_pty / TOFU)維持,消費者只換型別名。
//
// 設計:
// - **server pubkey TOFU**:每個 saved host 第一次連線記下 fingerprint,
//   之後比對。不符 → 拒絕(可能 MITM,或 server reinstall 換 host key,
//   user 要顯式 delete host 重加才接受新 key)。驗證在 russh `Handler::
//   check_server_key` 裡做(kex 階段),不符直接讓握手失敗。
//   test_connection(form 還沒有 host_id)走 AcceptAny — 文件警告 user
//   第一次測試這條 link 不檢查,save 起來之後才綁。
// - fingerprint 格式 `SHA256:<base64 無 padding>`(ssh-key crate 的
//   `Fingerprint` Display),跟 makiko 時期寫進 DB 的一模一樣,既有紀錄照用。
// - 支援 password 跟 pubkey(OpenSSH / PEM,unencrypted + with passphrase;
//   Ed25519 / RSA / ECDSA 都吃,RSA 走 rsa-sha2-256)
// - test_connection 跑 `whoami` 確認 channel 可開、auth + exec 全鏈路通
// - `SshSession`(M1d):一條 SSH 連線多 channel,給 capture_host_inner 用
//   (SPEC §9.2「每 host 一條 persistent SSH」);russh 的 session task 由
//   `Handle` 持有,drop 即斷線,不需自己 spawn drive task
// - `PtyChannel`(M1f attach):開 channel + request_pty,exec / shell 後拆成
//   read / write 兩半,reader task 持 read 半、registry 持 write 半

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail, Result};
use russh::client::{self, AuthResult, Handle, Msg};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{ChannelMsg, ChannelReadHalf, ChannelWriteHalf};
use sqlx::sqlite::SqlitePool;
use tokio::time::timeout;

use crate::host_keys;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// 連線層 keepalive:attach 可能掛幾小時,NAT / 防火牆的 idle timeout 會默默
/// 斷線;60s 一個 SSH keepalive、連續 3 次沒回才判死。
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(60);
const KEEPALIVE_MAX: usize = 3;

/// 上傳分塊大小(D-40)。串流送 stdin,避免大檔一次進記憶體;
/// 32KB 平衡 round-trip 數與記憶體。
const UPLOAD_CHUNK: usize = 32 * 1024;

/// attach PTY 的 TERM。
const PTY_TERM: &str = "xterm-256color";

/// attach reader task 用的 channel 訊息型別(re-export,讓 attach.rs 不直接依賴 russh)。
pub type PtyMsg = ChannelMsg;
/// PTY channel 的讀半(reader task 持有,`wait()` 收 Data / Eof / Close …)。
pub type PtyRead = ChannelReadHalf;
/// PTY channel 的寫半(registry 持有,stdin / window_change / close)。
pub type PtyWrite = ChannelWriteHalf<Msg>;

#[allow(dead_code)] // 留欄位給 commands.rs 塞值,M1f attach 才會全用上
pub enum AuthMaterial<'a> {
    Password(&'a str),
    Key {
        path: &'a Path,
        passphrase: Option<&'a str>,
    },
}

/// Server pubkey 信任策略 — 強迫每個 caller 顯式選一個,避免「忘記驗 host key」
/// 這種 silent footgun。
pub enum HostKeyPolicy<'a> {
    /// 接受任何 server key — 只給 test_connection 用(form 還沒 save,
    /// 沒有 host_id 可綁)。其他路徑一律走 Tofu。
    AcceptAny,
    /// TOFU:第一次連線把 fingerprint 寫進 DB,之後比對。不符 → 拒絕。
    Tofu {
        pool: &'a SqlitePool,
        host_id: &'a str,
    },
}

/// 一條已連 + 已 auth 的 SSH session。多 channel 共用;`Handle` drop 時
/// russh 內部 session task 結束、TCP 關閉。M1d capture_host_inner 用這個讓一個
/// host 一條 SSH 跑多 capture channel(SPEC §9.2 「host 內限制 3 個並行 channel」)。
pub struct SshSession {
    handle: Handle<TofuHandler>,
}

impl SshSession {
    /// 在這條 connection 上開新 channel 跑 cmd,收齊 stdout 回傳。
    /// `&self` 故可同時被多個 task await(russh `channel_open_session(&self)`,
    /// channel multiplexing OK)。exit code 非 0 → Err 帶 stderr。
    pub async fn exec(&self, cmd: &str) -> Result<String> {
        exec_on(&self.handle, cmd).await
    }

    /// 把 `data` 寫進遠端 `remote_cmd_target`(D-40)。不走 SFTP(多一個 subsystem
    /// 依賴),沿用 exec `cat > <path>` + 串流 stdin + eof(經典 SSH-over-exec 傳檔)。
    /// **`remote_cmd_target` 必須是已 shell-quote 的完整路徑**(caller 負責 quote)。
    /// `cat >` 會覆蓋同名檔;path 的目錄不存在則 remote shell 回非 0,這裡 bail。
    pub async fn upload(&self, remote_cmd_target: &str, data: &[u8]) -> Result<()> {
        upload_on(&self.handle, remote_cmd_target, data).await
    }

    /// 給 attach.rs 用 — 開 channel + request_pty(cols×rows,TERM=xterm-256color)。
    /// 回 `PtyChannel`,caller 接著 `exec` / `shell` 再 `into_parts`。
    /// capture / list-sessions 走 `exec`,不該動這個。
    pub async fn open_pty(&self, cols: u32, rows: u32) -> Result<PtyChannel> {
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| anyhow!("open session: {e}"))?;
        let (mut read, write) = channel.split();
        write
            .request_pty(true, PTY_TERM, cols, rows, 0, 0, &[])
            .await
            .map_err(|e| anyhow!("request_pty: {e}"))?;
        await_reply(&mut read, "request_pty").await?;
        Ok(PtyChannel { read, write })
    }
}

/// 已 request_pty 的 channel,還沒決定跑 exec 還是 shell。
pub struct PtyChannel {
    read: PtyRead,
    write: PtyWrite,
}

impl PtyChannel {
    /// 在 PTY 上 exec 一條指令(attach_session:`tmux attach`),等 server 回 success。
    pub async fn exec(&mut self, cmd: &str) -> Result<()> {
        self.write
            .exec(true, cmd.as_bytes())
            .await
            .map_err(|e| anyhow!("exec request: {e}"))?;
        await_reply(&mut self.read, "exec").await
    }

    /// 在 PTY 上開 user 的 login shell(attach_shell,NOTES D-14)。
    pub async fn shell(&mut self) -> Result<()> {
        self.write
            .request_shell(true)
            .await
            .map_err(|e| anyhow!("shell request: {e}"))?;
        await_reply(&mut self.read, "shell").await
    }

    /// 拆成 (讀半, 寫半):reader task 拿讀半 `wait()`,registry 拿寫半送 stdin /
    /// window_change / close。
    pub fn into_parts(self) -> (PtyRead, PtyWrite) {
        (self.read, self.write)
    }
}

/// TCP + SSH handshake + auth,回一個可 reuse 的 SshSession。
/// `policy` 決定 server pubkey 是否驗 — saved host 一律傳 `Tofu`,
/// 只有 test_connection(form 還沒 save)傳 `AcceptAny`。
pub async fn connect(
    host: &str,
    port: u16,
    user: &str,
    auth: AuthMaterial<'_>,
    policy: HostKeyPolicy<'_>,
) -> Result<SshSession> {
    let config = Arc::new(client::Config {
        inactivity_timeout: None,
        keepalive_interval: Some(KEEPALIVE_INTERVAL),
        keepalive_max: KEEPALIVE_MAX,
        ..Default::default()
    });
    let handler = TofuHandler {
        tofu: match policy {
            HostKeyPolicy::AcceptAny => None,
            HostKeyPolicy::Tofu { pool, host_id } => Some((pool.clone(), host_id.to_string())),
        },
    };

    // TOFU 不符會從 check_server_key 以 anyhow error 丟出來,原封往上傳
    // (caller 用 `{e}` 印,不能再包一層 context 把訊息蓋掉)。
    let mut handle = timeout(CONNECT_TIMEOUT, client::connect(config, (host, port), handler))
        .await
        .map_err(|_| anyhow!("ssh connect timeout ({}s)", CONNECT_TIMEOUT.as_secs()))??;

    do_auth(&mut handle, user, auth).await?;

    Ok(SshSession { handle })
}

pub async fn test_connection(
    host: &str,
    port: u16,
    user: &str,
    auth: AuthMaterial<'_>,
) -> Result<()> {
    // test_connection 沒 host_id(form 還沒 save),只能 AcceptAny。
    // 真正 save 後第一次 list_sessions / host_status 才會綁 TOFU fingerprint。
    let session = connect(host, port, user, auth, HostKeyPolicy::AcceptAny).await?;
    // exec whoami 驗 channel 可開、auth + exec 全鏈路通
    session.exec("whoami").await?;
    Ok(())
}

/// 連 + auth + 跑單一 cmd 後直接收尾。one-shot 場景用(`list_sessions` /
/// `capture_session`)。需要連一次跑多 cmd 的場景請用 `connect` + `SshSession::exec`。
pub async fn run_command(
    host: &str,
    port: u16,
    user: &str,
    auth: AuthMaterial<'_>,
    policy: HostKeyPolicy<'_>,
    cmd: &str,
) -> Result<String> {
    let session = connect(host, port, user, auth, policy).await?;
    session.exec(cmd).await
}

// ---- Handler:TOFU 在 kex 階段驗 server key ----

struct TofuHandler {
    /// `Some((pool, host_id))` = TOFU;`None` = AcceptAny。
    tofu: Option<(SqlitePool, String)>,
}

impl client::Handler for TofuHandler {
    type Error = anyhow::Error;

    /// TOFU 驗證 — saved host 第一次連把 fingerprint 寫進 DB,之後比對。
    /// 不符 → Err 讓握手失敗,錯誤訊息含 stored + received 兩個 fingerprint,
    /// 讓 user 自己判斷是 MITM 還是 server reinstall。AcceptAny 直接過。
    async fn check_server_key(&mut self, server_key: &PublicKeyOrCertificate) -> Result<bool> {
        let Some((pool, host_id)) = &self.tofu else {
            return Ok(true);
        };
        let pubkey = match server_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => key,
            PublicKeyOrCertificate::Certificate(_) => {
                bail!("server 用 host certificate 認證,piermux 的 TOFU 目前只比對 plain host key")
            }
        };
        let received_type = pubkey.algorithm().as_str().to_string();
        let received_fingerprint = pubkey.fingerprint(HashAlg::Sha256).to_string();

        match host_keys::lookup(pool, host_id).await? {
            None => {
                // 第一次見 — 信任 + 寫進 DB
                host_keys::record_first_seen(pool, host_id, &received_type, &received_fingerprint)
                    .await?;
                Ok(true)
            }
            Some(stored) if stored.fingerprint == received_fingerprint => Ok(true),
            Some(stored) => bail!(
                "server host key 不符! 可能是 MITM 攻擊,或 server 換 key。\n\
                 已記錄: {stored_type} {stored_fp}\n\
                 收到:  {received_type} {received_fingerprint}\n\
                 確認沒事的話,刪掉這個 host 重加(這會清掉 stored fingerprint)。",
                stored_type = stored.key_type,
                stored_fp = stored.fingerprint,
            ),
        }
    }
}

// ---- 內部 helpers ----

/// 等 want_reply=true 的 channel request 回 Success / Failure。中間其他訊息略過。
async fn await_reply(read: &mut PtyRead, what: &str) -> Result<()> {
    loop {
        match read.wait().await {
            Some(ChannelMsg::Success) => return Ok(()),
            Some(ChannelMsg::Failure) => bail!("{what}: server 拒絕 request"),
            Some(ChannelMsg::Close) | None => bail!("{what}: channel 在回覆前就關了"),
            Some(_) => continue,
        }
    }
}

/// Eof 之後最多再等這麼久的 exit-status / Close。OpenSSH 實測順序是
/// eof → exit-status → close(子行程先關 stdout 才被 wait 到),所以 Eof 時
/// exit code 通常還沒來;但也別無上限等 —— 有些 server 不主動送 Close。
const EXIT_STATUS_GRACE: Duration = Duration::from_secs(3);

/// 收 exec 類 channel 的輸出直到 Close(或 Eof 後寬限期滿):回 (stdout, stderr, exit_code)。
async fn collect_exec_output(read: &mut PtyRead) -> (Vec<u8>, Vec<u8>, Option<u32>) {
    let mut stdout = Vec::<u8>::new();
    let mut stderr = Vec::<u8>::new();
    let mut exit_code: Option<u32> = None;
    let mut eof = false;
    loop {
        let msg = if eof {
            match timeout(EXIT_STATUS_GRACE, read.wait()).await {
                Ok(m) => m,
                Err(_) => break,
            }
        } else {
            read.wait().await
        };
        match msg {
            Some(ChannelMsg::Data { data }) => stdout.extend_from_slice(&data),
            Some(ChannelMsg::ExtendedData { data, ext: 1 }) => stderr.extend_from_slice(&data),
            Some(ChannelMsg::ExitStatus { exit_status }) => {
                exit_code = Some(exit_status);
                if eof {
                    break;
                }
            }
            Some(ChannelMsg::Eof) => {
                if exit_code.is_some() {
                    break;
                }
                eof = true;
            }
            Some(ChannelMsg::Close) | None => break,
            Some(_) => continue,
        }
    }
    (stdout, stderr, exit_code)
}

async fn exec_on(handle: &Handle<TofuHandler>, cmd: &str) -> Result<String> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("open session: {e}"))?;
    let (mut read, write) = channel.split();
    write
        .exec(true, cmd.as_bytes())
        .await
        .map_err(|e| anyhow!("exec request: {e}"))?;
    await_reply(&mut read, "exec").await?;

    let (stdout, stderr, exit_code) = collect_exec_output(&mut read).await;
    if let Some(code) = exit_code {
        if code != 0 {
            let stderr_str = String::from_utf8_lossy(&stderr);
            bail!("exec `{cmd}` exit code {code}: {stderr_str}");
        }
    }
    Ok(String::from_utf8_lossy(&stdout).into_owned())
}

/// exec `cat > <path>`,把 data 串流進 stdin 再 eof,等 exit status(D-40)。
async fn upload_on(
    handle: &Handle<TofuHandler>,
    remote_cmd_target: &str,
    data: &[u8],
) -> Result<()> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("open session: {e}"))?;
    let (mut read, write) = channel.split();
    let cmd = format!("cat > {remote_cmd_target}");
    write
        .exec(true, cmd.as_bytes())
        .await
        .map_err(|e| anyhow!("exec request: {e}"))?;
    await_reply(&mut read, "exec").await?;

    // 串流分塊 — data_bytes 內部處理 channel window 背壓,await 到寫出去才送下一塊
    for chunk in data.chunks(UPLOAD_CHUNK) {
        write
            .data_bytes(chunk.to_vec())
            .await
            .map_err(|e| anyhow!("send stdin: {e}"))?;
    }
    write.eof().await.map_err(|e| anyhow!("send eof: {e}"))?;

    let (_stdout, stderr, exit_code) = collect_exec_output(&mut read).await;
    if let Some(code) = exit_code {
        if code != 0 {
            let stderr_str = String::from_utf8_lossy(&stderr);
            bail!("upload `cat` exit code {code}: {stderr_str}");
        }
    }
    Ok(())
}

async fn do_auth(handle: &mut Handle<TofuHandler>, user: &str, auth: AuthMaterial<'_>) -> Result<()> {
    match auth {
        AuthMaterial::Password(pw) => {
            match handle
                .authenticate_password(user, pw)
                .await
                .map_err(|e| anyhow!("password auth request: {e}"))?
            {
                AuthResult::Success => Ok(()),
                AuthResult::Failure { .. } => bail!("password authentication failed"),
            }
        }
        AuthMaterial::Key { path, passphrase } => {
            // OpenSSH 新格式 / PEM 都吃;passphrase 錯或缺會回明確錯誤
            let key = match russh::keys::load_secret_key(path, passphrase) {
                Ok(k) => k,
                Err(russh::keys::Error::KeyIsEncrypted) => {
                    bail!("key is encrypted, please provide passphrase")
                }
                Err(e) => bail!("load key {path:?}: {e}"),
            };
            // RSA 走 rsa-sha2-256(SHA-1 的 ssh-rsa 新 OpenSSH 預設拒收);非 RSA 忽略 hash
            let key = PrivateKeyWithHashAlg::new(Arc::new(key), Some(HashAlg::Sha256));
            match handle
                .authenticate_publickey(user, key)
                .await
                .map_err(|e| anyhow!("pubkey auth request: {e}"))?
            {
                AuthResult::Success => Ok(()),
                AuthResult::Failure { .. } => bail!("pubkey authentication failed"),
            }
        }
    }
}

/// 真 SSH 端到端測試(D-47 換庫驗收)。需要一個可用 key 登入的 sshd,用環境變數指定:
///   PIERMUX_SSH_TEST_HOST / _PORT / _USER / _KEY(無 passphrase 私鑰路徑)
///   PIERMUX_SSH_TEST_KEY_PP + PIERMUX_SSH_TEST_PASSPHRASE(可選,測有 passphrase 的 key)
/// 沒設就 skip。跑法:`cargo test ssh::live -- --ignored --nocapture`。
#[cfg(test)]
mod live {
    use super::*;
    use std::path::PathBuf;

    struct Env {
        host: String,
        port: u16,
        user: String,
        key: PathBuf,
    }

    fn env() -> Option<Env> {
        let host = std::env::var("PIERMUX_SSH_TEST_HOST").ok()?;
        let port = std::env::var("PIERMUX_SSH_TEST_PORT").ok()?.parse().ok()?;
        let user = std::env::var("PIERMUX_SSH_TEST_USER").ok()?;
        let key = PathBuf::from(std::env::var("PIERMUX_SSH_TEST_KEY").ok()?);
        Some(Env { host, port, user, key })
    }

    async fn connect_env(e: &Env, key: &Path, passphrase: Option<&str>) -> SshSession {
        connect(
            &e.host,
            e.port,
            &e.user,
            AuthMaterial::Key { path: key, passphrase },
            HostKeyPolicy::AcceptAny,
        )
        .await
        .expect("connect + pubkey auth")
    }

    #[tokio::test]
    #[ignore]
    async fn exec_whoami_and_exit_code() {
        let Some(e) = env() else { return };
        let s = connect_env(&e, &e.key, None).await;
        let out = s.exec("whoami").await.unwrap();
        assert_eq!(out.trim(), e.user);
        // stderr + 非 0 exit 要變 Err 且帶 stderr
        let err = s.exec("echo boom >&2; exit 3").await.unwrap_err().to_string();
        assert!(err.contains("exit code 3") && err.contains("boom"), "{err}");
        // 同一條連線多 channel 並行
        let (a, b) = tokio::join!(s.exec("echo A"), s.exec("echo B"));
        assert_eq!((a.unwrap().trim(), b.unwrap().trim()), ("A", "B"));
    }

    #[tokio::test]
    #[ignore]
    async fn key_with_passphrase() {
        let Some(e) = env() else { return };
        let (Ok(kp), Ok(pp)) = (
            std::env::var("PIERMUX_SSH_TEST_KEY_PP"),
            std::env::var("PIERMUX_SSH_TEST_PASSPHRASE"),
        ) else {
            return;
        };
        let kp = PathBuf::from(kp);
        // 缺 passphrase → 明確錯誤,不是亂碼
        let err = connect(&e.host, e.port, &e.user, AuthMaterial::Key { path: &kp, passphrase: None }, HostKeyPolicy::AcceptAny)
            .await
            .err()
            .map(|e| e.to_string())
            .expect("缺 passphrase 應該失敗");
        assert!(err.contains("passphrase"), "{err}");
        let s = connect_env(&e, &kp, Some(&pp)).await;
        assert_eq!(s.exec("echo ok").await.unwrap().trim(), "ok");
    }

    #[tokio::test]
    #[ignore]
    async fn upload_roundtrip_binary() {
        let Some(e) = env() else { return };
        let s = connect_env(&e, &e.key, None).await;
        // 跨多個 UPLOAD_CHUNK + 含所有 byte 值
        let data: Vec<u8> = (0..(UPLOAD_CHUNK * 3 + 777)).map(|i| (i % 251) as u8).collect();
        let remote = format!("/tmp/piermux-ssh-test-{}.bin", std::process::id());
        s.upload(&format!("'{remote}'"), &data).await.unwrap();
        let sum_remote = s.exec(&format!("sha256sum '{remote}' | cut -d' ' -f1; rm -f '{remote}'")).await.unwrap();
        let sum_local = {
            use sha2_free::hex_sha256;
            hex_sha256(&data)
        };
        assert_eq!(sum_remote.trim(), sum_local);
        // 目錄不存在 → cat 非 0 → Err
        assert!(s.upload("'/nonexistent-dir-xyz/f'", b"x").await.is_err());
    }

    #[tokio::test]
    #[ignore]
    async fn pty_exec_shell_and_resize() {
        let Some(e) = env() else { return };
        let s = connect_env(&e, &e.key, None).await;
        // exec 路(attach_session):PTY 上跑指令,stty 看到的尺寸要等於 request_pty 的
        let mut pty = s.open_pty(97, 31).await.unwrap();
        pty.exec("stty size; printf 'PTY_EXEC_OK\\n'").await.unwrap();
        let (mut rx, _tx) = pty.into_parts();
        let (out, _, _) = collect_exec_output(&mut rx).await;
        let out = String::from_utf8_lossy(&out);
        assert!(out.contains("31 97"), "{out}");
        assert!(out.contains("PTY_EXEC_OK"), "{out}");

        // shell 路(attach_shell):送 stdin、window_change、eof
        let mut pty = s.open_pty(80, 24).await.unwrap();
        pty.shell().await.unwrap();
        let (mut rx, tx) = pty.into_parts();
        tx.window_change(120, 40, 0, 0).await.unwrap();
        tx.data_bytes(b"stty size; echo SHELL_OK; exit\n".to_vec()).await.unwrap();
        let (out, _, _) = tokio::time::timeout(Duration::from_secs(10), collect_exec_output(&mut rx))
            .await
            .expect("shell 10s 內要結束");
        let out = String::from_utf8_lossy(&out);
        assert!(out.contains("40 120"), "{out}");
        assert!(out.contains("SHELL_OK"), "{out}");
    }

    /// 測試用最小 SHA-256(避免為測試多拉 dep)—— 只在 test build 存在。
    mod sha2_free {
        pub fn hex_sha256(data: &[u8]) -> String {
            // 沒有 sha2 crate 時退而用遠端比對的方式:這裡用 FNV 當不了 sha256,
            // 所以直接呼叫系統 sha256sum(測試機一定有)。
            use std::io::Write;
            use std::process::{Command, Stdio};
            let mut child = Command::new("sha256sum")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
                .expect("sha256sum");
            child.stdin.take().unwrap().write_all(data).unwrap();
            let out = child.wait_with_output().unwrap();
            String::from_utf8_lossy(&out.stdout).split_whitespace().next().unwrap().to_string()
        }
    }
}
