// SSH client(makiko 0.2 backend)。
// 取代 stub 之前的 russh,因為 russh 0.60.1 拉的 ed25519-dalek 3.0.0-pre.6
// 跟新版 pkcs8 不容(NOTES.md D-6)。makiko 是 stable + pure Rust(M2 Android
// 同樣 cross-compile,跟 russh 同性質),作為短期解法 / 視 PTY 行為決定是否常駐。
//
// 設計:
// - 接受 ANY server pubkey(M1b 階段不做 known_hosts;M1c+ 補)
// - 支援 password 跟 pubkey(unencrypted + with passphrase)
// - test_connection 跑 `whoami` 確認 channel 可開、auth + exec 全鏈路通

use anyhow::{anyhow, bail, Result};
use makiko::{AuthPasswordResult, AuthPubkeyResult, Client, ClientConfig, ClientEvent};
use std::path::Path;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

#[allow(dead_code)] // 留欄位給 commands.rs 塞值,M1f attach 才會全用上
pub enum AuthMaterial<'a> {
    Password(&'a str),
    Key {
        path: &'a Path,
        passphrase: Option<&'a str>,
    },
}

pub async fn test_connection(
    host: &str,
    port: u16,
    user: &str,
    auth: AuthMaterial<'_>,
) -> Result<()> {
    // 1. TCP
    let stream = timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port)))
        .await
        .map_err(|_| anyhow!("tcp connect timeout ({}s)", CONNECT_TIMEOUT.as_secs()))?
        .map_err(|e| anyhow!("tcp connect: {e}"))?;

    // 2. SSH handshake
    let config = ClientConfig::default_compatible_less_secure();
    let (client, mut receiver, future) =
        Client::open(stream, config).map_err(|e| anyhow!("open ssh client: {e}"))?;

    // Drive the client future in background。abort 在 fn 結束 drop drive 時自動發。
    let drive = tokio::spawn(async move {
        let _ = future.await;
    });

    // 3. 等 server pubkey,接受(M1b: 一律 ok,known_hosts 留 M1c+)
    loop {
        match receiver
            .recv()
            .await
            .map_err(|e| anyhow!("recv server event: {e}"))?
        {
            Some(ClientEvent::ServerPubkey(_pubkey, accept_tx)) => {
                accept_tx.accept();
                break;
            }
            Some(_) => continue,
            None => bail!("server closed before pubkey exchange"),
        }
    }

    // 4. Auth
    match auth {
        AuthMaterial::Password(pw) => {
            let result = client
                .auth_password(user.to_string(), pw.to_string())
                .await
                .map_err(|e| anyhow!("password auth request: {e}"))?;
            match result {
                AuthPasswordResult::Success => {}
                AuthPasswordResult::Failure(_) => bail!("password authentication failed"),
                AuthPasswordResult::ChangePassword(_) => {
                    bail!("server requires password change");
                }
            }
        }
        AuthMaterial::Key { path, passphrase } => {
            let pem = std::fs::read(path).map_err(|e| anyhow!("read key {path:?}: {e}"))?;
            // decode_pem_privkey_nopass 回 DecodedPrivkeyNopass enum,
            // decode_pem_privkey 回 Privkey 直接 — 兩條 path 統一拿到 Privkey
            let privkey: makiko::keys::Privkey = match passphrase {
                None => match makiko::keys::decode_pem_privkey_nopass(&pem)
                    .map_err(|e| anyhow!("decode key (no passphrase): {e}"))?
                {
                    makiko::keys::DecodedPrivkeyNopass::Privkey(pk) => pk,
                    _ => bail!("key is encrypted, please provide passphrase"),
                },
                Some(pp) => makiko::keys::decode_pem_privkey(&pem, pp.as_bytes())
                    .map_err(|e| anyhow!("decode key with passphrase: {e}"))?,
            };

            // makiko 的 auth_pubkey 要 explicit 演算法。挑 modern preset:
            // - Ed25519 → SSH_ED25519
            // - RSA → SHA2-256(現代 ssh server 都接,SHA1 廢棄)
            // - 其他類型(ECDSA / Dsa)M1b 不支援,owner 撞到再補
            let algo: &'static makiko::pubkey::PubkeyAlgo = match &privkey {
                makiko::keys::Privkey::Ed25519(_) => &makiko::pubkey::SSH_ED25519,
                makiko::keys::Privkey::Rsa(_) => &makiko::pubkey::RSA_SHA2_256,
                _ => bail!("M1b 暫只支援 Ed25519 / RSA 私鑰;ECDSA/DSA 之後補"),
            };

            let result = client
                .auth_pubkey(user.to_string(), privkey, algo)
                .await
                .map_err(|e| anyhow!("pubkey auth request: {e}"))?;
            match result {
                AuthPubkeyResult::Success => {}
                AuthPubkeyResult::Failure(_) => bail!("pubkey authentication failed"),
            }
        }
    }

    // 5. 開 session 跑 whoami(只要 .wait() 完成代表 server 收到並執行了)
    let (session, _session_rx) = client
        .open_session(makiko::ChannelConfig::default())
        .await
        .map_err(|e| anyhow!("open session: {e}"))?;
    session
        .exec(b"whoami")
        .map_err(|e| anyhow!("exec whoami request: {e}"))?
        .wait()
        .await
        .map_err(|e| anyhow!("exec whoami wait: {e}"))?;

    // 6. 收尾。drive task 在 client drop + drive abort 後會結束。
    drop(client);
    drive.abort();

    Ok(())
}
