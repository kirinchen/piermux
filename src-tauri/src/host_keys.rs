// TOFU (Trust On First Use) server pubkey 記錄。
//
// 第一次連 host 把 server pubkey fingerprint 寫進 DB,之後每次連線比對。
// 不符 → 拒絕連線(可能是 MITM,或 server reinstall 換了 host key)。
//
// fingerprint 格式對齊 OpenSSH `ssh-keygen -lf`:`SHA256:<base64-unpadded>`。
// makiko 的 `Pubkey::fingerprint()` 直接給這格式,DB 存原樣即可。

use anyhow::Result;
use chrono::Utc;
use sqlx::sqlite::SqlitePool;

#[derive(Debug, Clone)]
pub struct HostKey {
    pub key_type: String,
    pub fingerprint: String,
}

pub async fn lookup(pool: &SqlitePool, host_id: &str) -> Result<Option<HostKey>> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT key_type, fingerprint FROM host_keys WHERE host_id = ?")
            .bind(host_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(key_type, fingerprint)| HostKey {
        key_type,
        fingerprint,
    }))
}

/// 第一次見到的 server key — INSERT(`ON CONFLICT DO NOTHING` 防 race)。
/// 已存在的 host_id 不會被覆寫;改 key 必須走 forget() 明示「我接受新 key」。
pub async fn record_first_seen(
    pool: &SqlitePool,
    host_id: &str,
    key_type: &str,
    fingerprint: &str,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO host_keys (host_id, key_type, fingerprint, first_seen_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(host_id) DO NOTHING",
    )
    .bind(host_id)
    .bind(key_type)
    .bind(fingerprint)
    .bind(&now)
    .execute(pool)
    .await?;
    Ok(())
}

/// 刪掉某 host 的記錄。delete_host 時呼叫一起清。
/// 之後 M3 可能加 UI「我信任新 key」也走這個 + record_first_seen。
pub async fn forget(pool: &SqlitePool, host_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM host_keys WHERE host_id = ?")
        .bind(host_id)
        .execute(pool)
        .await?;
    Ok(())
}
