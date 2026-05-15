// SSH client(makiko 0.2 backend)。
// 取代 stub 之前的 russh,因為 russh 0.60.1 拉的 ed25519-dalek 3.0.0-pre.6
// 跟新版 pkcs8 不容(NOTES.md D-6)。makiko 是 stable + pure Rust(M2 Android
// 同樣 cross-compile,跟 russh 同性質),作為短期解法 / 視 PTY 行為決定是否常駐。
//
// 設計:
// - **server pubkey TOFU**:每個 saved host 第一次連線記下 fingerprint,
//   之後比對。不符 → 拒絕(可能 MITM,或 server reinstall 換 host key,
//   user 要顯式 delete host 重加才接受新 key)。
//   test_connection(form 還沒有 host_id)走 AcceptAny — 文件警告 user
//   第一次測試這條 link 不檢查,save 起來之後才綁
// - 支援 password 跟 pubkey(unencrypted + with passphrase)
// - test_connection 跑 `whoami` 確認 channel 可開、auth + exec 全鏈路通
// - `SshSession`(M1d):一條 SSH 連線多 channel,給 capture_host_inner 用
//   (SPEC §9.2「每 host 一條 persistent SSH」),drop 時 drive task abort

use anyhow::{anyhow, bail, Result};
use makiko::{
    AuthPasswordResult, AuthPubkeyResult, Client, ClientConfig, ClientEvent, SessionEvent,
};
use sqlx::sqlite::SqlitePool;
use std::path::Path;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::task::JoinHandle;
use tokio::time::timeout;

use crate::host_keys;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

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

/// 一條已連 + 已 auth 的 SSH session。多 channel 共用,drop 時把 drive
/// task abort。M1d capture_host_inner 用這個讓一個 host 一條 SSH 跑多 capture
/// channel(SPEC §9.2 「host 內限制 3 個並行 channel」)。
pub struct SshSession {
    client: Client,
    drive: Option<JoinHandle<()>>,
}

impl SshSession {
    /// 在這條 connection 上開新 channel 跑 cmd,收齊 stdout 回傳。
    /// `&self` 故可同時被多個 task await(makiko Client 內部 sync,channel
    /// multiplexing OK)。
    pub async fn exec(&self, cmd: &str) -> Result<String> {
        exec_on(&self.client, cmd).await
    }

    /// 給 attach.rs 用 — 直接拿 underlying makiko Client 開 PTY session。
    /// capture / list-sessions 走 `exec`,不該動這個。
    pub fn client(&self) -> &Client {
        &self.client
    }
}

impl Drop for SshSession {
    fn drop(&mut self) {
        // drop client 觸發 makiko 內部 close + drive 後續 abort
        if let Some(d) = self.drive.take() {
            d.abort();
        }
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
    let stream = timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port)))
        .await
        .map_err(|_| anyhow!("tcp connect timeout ({}s)", CONNECT_TIMEOUT.as_secs()))?
        .map_err(|e| anyhow!("tcp connect: {e}"))?;

    let config = ClientConfig::default_compatible_less_secure();
    let (client, mut receiver, future) =
        Client::open(stream, config).map_err(|e| anyhow!("open ssh client: {e}"))?;
    let drive = tokio::spawn(async move {
        let _ = future.await;
    });

    loop {
        match receiver
            .recv()
            .await
            .map_err(|e| anyhow!("recv server event: {e}"))?
        {
            Some(ClientEvent::ServerPubkey(pubkey, accept_tx)) => {
                verify_server_pubkey(&pubkey, &policy).await?;
                accept_tx.accept();
                break;
            }
            Some(_) => continue,
            None => bail!("server closed before pubkey exchange"),
        }
    }

    do_auth(&client, user, auth).await?;

    Ok(SshSession {
        client,
        drive: Some(drive),
    })
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

/// TOFU 驗證 — saved host 第一次連把 fingerprint 寫進 DB,之後比對。
/// 不符 → 拒絕連線,錯誤訊息含 stored + received 兩個 fingerprint,讓 user
/// 自己判斷是 MITM 還是 server reinstall。AcceptAny 直接過。
async fn verify_server_pubkey(
    pubkey: &makiko::Pubkey,
    policy: &HostKeyPolicy<'_>,
) -> Result<()> {
    let (pool, host_id) = match policy {
        HostKeyPolicy::AcceptAny => return Ok(()),
        HostKeyPolicy::Tofu { pool, host_id } => (*pool, *host_id),
    };

    let received_type = pubkey.type_str();
    let received_fingerprint = pubkey.fingerprint();

    match host_keys::lookup(pool, host_id).await? {
        None => {
            // 第一次見 — 信任 + 寫進 DB
            host_keys::record_first_seen(pool, host_id, &received_type, &received_fingerprint)
                .await?;
            Ok(())
        }
        Some(stored) => {
            if stored.fingerprint == received_fingerprint {
                Ok(())
            } else {
                bail!(
                    "server host key 不符! 可能是 MITM 攻擊,或 server 換 key。\n\
                     已記錄: {stored_type} {stored_fp}\n\
                     收到:  {received_type} {received_fingerprint}\n\
                     確認沒事的話,刪掉這個 host 重加(這會清掉 stored fingerprint)。",
                    stored_type = stored.key_type,
                    stored_fp = stored.fingerprint,
                )
            }
        }
    }
}

// ---- 內部 helpers ----

async fn exec_on(client: &Client, cmd: &str) -> Result<String> {
    let (session, mut sess_rx) = client
        .open_session(makiko::ChannelConfig::default())
        .await
        .map_err(|e| anyhow!("open session: {e}"))?;
    session
        .exec(cmd.as_bytes())
        .map_err(|e| anyhow!("exec request: {e}"))?
        .wait()
        .await
        .map_err(|e| anyhow!("exec wait: {e}"))?;

    let mut stdout = Vec::<u8>::new();
    let mut stderr = Vec::<u8>::new();
    let mut exit_code: Option<i32> = None;
    while let Some(event) = sess_rx
        .recv()
        .await
        .map_err(|e| anyhow!("recv session event: {e}"))?
    {
        match event {
            SessionEvent::StdoutData(bytes) => stdout.extend_from_slice(&bytes),
            SessionEvent::StderrData(bytes) => stderr.extend_from_slice(&bytes),
            SessionEvent::ExitStatus(code) => exit_code = Some(code as i32),
            SessionEvent::Eof => break,
            _ => continue,
        }
    }

    if let Some(code) = exit_code {
        if code != 0 {
            let stderr_str = String::from_utf8_lossy(&stderr);
            bail!("exec `{cmd}` exit code {code}: {stderr_str}");
        }
    }
    Ok(String::from_utf8_lossy(&stdout).into_owned())
}

async fn do_auth(client: &Client, user: &str, auth: AuthMaterial<'_>) -> Result<()> {
    match auth {
        AuthMaterial::Password(pw) => {
            let result = client
                .auth_password(user.to_string(), pw.to_string())
                .await
                .map_err(|e| anyhow!("password auth request: {e}"))?;
            match result {
                AuthPasswordResult::Success => Ok(()),
                AuthPasswordResult::Failure(_) => bail!("password authentication failed"),
                AuthPasswordResult::ChangePassword(_) => {
                    bail!("server requires password change");
                }
            }
        }
        AuthMaterial::Key { path, passphrase } => {
            let pem = std::fs::read(path).map_err(|e| anyhow!("read key {path:?}: {e}"))?;
            let privkey: makiko::Privkey = match passphrase {
                None => match makiko::keys::decode_pem_privkey_nopass(&pem)
                    .map_err(|e| anyhow!("decode key (no passphrase): {e}"))?
                {
                    makiko::keys::DecodedPrivkeyNopass::Privkey(pk) => pk,
                    _ => bail!("key is encrypted, please provide passphrase"),
                },
                Some(pp) => makiko::keys::decode_pem_privkey(&pem, pp.as_bytes())
                    .map_err(|e| anyhow!("decode key with passphrase: {e}"))?,
            };
            let algo: &'static makiko::pubkey::PubkeyAlgo = match &privkey {
                makiko::Privkey::Ed25519(_) => &makiko::pubkey::SSH_ED25519,
                makiko::Privkey::Rsa(_) => &makiko::pubkey::RSA_SHA2_256,
                _ => bail!("M1b 暫只支援 Ed25519 / RSA 私鑰;ECDSA/DSA 之後補"),
            };
            let result = client
                .auth_pubkey(user.to_string(), privkey, algo)
                .await
                .map_err(|e| anyhow!("pubkey auth request: {e}"))?;
            match result {
                AuthPubkeyResult::Success => Ok(()),
                AuthPubkeyResult::Failure(_) => bail!("pubkey authentication failed"),
            }
        }
    }
}
