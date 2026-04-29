// SSH client。**test_connection 暫時 stub** —— russh 0.60.1 拉的
// ed25519-dalek 3.0.0-pre.6 跟新版 pkcs8 crate enum API 對不上(`Error::KeyMalformed`
// unit → tuple variant),source 編不過。等 upstream 修或 ed25519-dalek
// patch fork 部署完(NOTES.md D-6)再把這檔換回 russh 實作。
//
// signature 跟 AuthMaterial 保留,讓 commands.rs 跟未來 swap 都不用改 caller。

use anyhow::{anyhow, Result};
use std::path::Path;

// 欄位現在 stub 期間不會讀,但 commands.rs 已經在塞值,M1b/1.5 接回 russh
// 會直接讀。先標 allow,讓 cargo clippy -- -D warnings 過得去。
#[allow(dead_code)]
pub enum AuthMaterial<'a> {
    Password(&'a str),
    Key {
        path: &'a Path,
        passphrase: Option<&'a str>,
    },
}

pub async fn test_connection(
    _host: &str,
    _port: u16,
    _user: &str,
    _auth: AuthMaterial<'_>,
) -> Result<()> {
    Err(anyhow!(
        "test_connection 暫時下線 — russh dep 卡 ed25519-dalek pre-release bug,\
         等 upstream 修或 patch 部署完(NOTES.md D-6)"
    ))
}
