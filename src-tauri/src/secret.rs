// 對 OS secret store 的薄封裝。account 用 "host/{host_id}/{kind}"
// 對齊 NOTES.md D-3 的 alias 規則。
//
// Desktop:keyring-rs → OS keystore(SPEC §5,Service name 固定 "piermux")。
// Android:keyring crate 沒有 Android 後端 —— D-9 加的 apple-native /
//   windows-native / sync-secret-service 全是 desktop,在 Android 上
//   fallback 成 in-memory mock(寫了就丟)。改存進 app 私有資料夾:
//   Android app sandbox 保證別的 app 讀不到,非 root 裝置等同私有儲存。
//   偏離 SPEC §5「OS keystore」,見 NOTES D-18 —— 非硬體加密,真正的
//   Android Keystore plugin 留作後續。

use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

// Android 後端用的 secrets 目錄(= app_data_dir/secrets)。
// lib.rs 的 setup hook 透過 init_dir 注入;desktop 走 keyring 用不到。
static SECRET_DIR: OnceLock<PathBuf> = OnceLock::new();

/// lib.rs setup hook 呼叫,把 app 私有資料夾交給本模組。
/// Desktop 不需要(keyring 自己管儲存位置),呼叫了也無害。
pub fn init_dir(app_data_dir: &Path) {
    let _ = SECRET_DIR.set(app_data_dir.join("secrets"));
}

pub fn store_password(host_id: &str, password: &str) -> Result<()> {
    backend::store(host_id, "password", password)
}

// sessions.rs 對 auth_type='password' 的 host attach / list_sessions 時讀回
#[allow(dead_code)]
pub fn read_password(host_id: &str) -> Result<Option<String>> {
    backend::read(host_id, "password")
}

pub fn delete_password(host_id: &str) -> Result<()> {
    backend::delete(host_id, "password")
}

// ---- Desktop:keyring-rs(OS keystore)----
#[cfg(not(target_os = "android"))]
mod backend {
    use super::Result;
    use keyring::Entry;

    const SERVICE: &str = "piermux";

    fn entry(host_id: &str, kind: &str) -> Result<Entry> {
        let account = format!("host/{host_id}/{kind}");
        Entry::new(SERVICE, &account).map_err(Into::into)
    }

    pub fn store(host_id: &str, kind: &str, password: &str) -> Result<()> {
        entry(host_id, kind)?.set_password(password)?;
        Ok(())
    }

    pub fn read(host_id: &str, kind: &str) -> Result<Option<String>> {
        match entry(host_id, kind)?.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete(host_id: &str, kind: &str) -> Result<()> {
        match entry(host_id, kind)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}

// ---- Android:app 私有資料夾(keyring 無 Android 後端)----
#[cfg(target_os = "android")]
mod backend {
    use super::{Result, SECRET_DIR};
    use anyhow::{anyhow, Context};
    use std::fs;
    use std::io::ErrorKind;
    use std::path::PathBuf;

    fn secret_file(host_id: &str, kind: &str) -> Result<PathBuf> {
        let dir = SECRET_DIR
            .get()
            .ok_or_else(|| anyhow!("secret dir 未初始化 —— lib.rs setup 沒呼叫 init_dir"))?;
        // host_id 是 UUID(D-3),只含 hex + '-';kind 是固定字串 —— 當檔名安全。
        Ok(dir.join(format!("{host_id}.{kind}")))
    }

    pub fn store(host_id: &str, kind: &str, password: &str) -> Result<()> {
        let path = secret_file(host_id, kind)?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).context("建立 secrets 目錄")?;
        }
        fs::write(&path, password.as_bytes()).context("寫入 secret 檔")?;
        Ok(())
    }

    pub fn read(host_id: &str, kind: &str) -> Result<Option<String>> {
        let path = secret_file(host_id, kind)?;
        match fs::read(&path) {
            Ok(bytes) => Ok(Some(String::from_utf8(bytes).context("secret 檔非 UTF-8")?)),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(e) => Err(anyhow::Error::new(e).context("讀取 secret 檔")),
        }
    }

    pub fn delete(host_id: &str, kind: &str) -> Result<()> {
        let path = secret_file(host_id, kind)?;
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(e) => Err(anyhow::Error::new(e).context("刪除 secret 檔")),
        }
    }
}
