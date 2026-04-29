// 對 keyring-rs 的薄封裝。Service name 固定 "piermux",
// account 用 "host/{host_id}/{kind}" 對齊 NOTES.md D-3 的 alias 規則。

use anyhow::Result;
use keyring::Entry;

const SERVICE: &str = "piermux";

fn entry(host_id: &str, kind: &str) -> Result<Entry> {
    let account = format!("host/{host_id}/{kind}");
    Entry::new(SERVICE, &account).map_err(Into::into)
}

pub fn store_password(host_id: &str, password: &str) -> Result<()> {
    entry(host_id, "password")?.set_password(password)?;
    Ok(())
}

// 留給 M1b/1.5 russh 接回後的 test_connection / 跟 M1f attach 用 —
// 那邊要從 keyring 讀回密碼餵給 SSH session(對 auth_type='password' 的 host)
#[allow(dead_code)]
pub fn read_password(host_id: &str) -> Result<Option<String>> {
    match entry(host_id, "password")?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_password(host_id: &str) -> Result<()> {
    match entry(host_id, "password")?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
