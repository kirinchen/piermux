-- piermux initial schema (matches doc/SPEC.md §5)
-- IF NOT EXISTS:讓 backend 啟動時的 apply_schema 跟 tauri-plugin-sql 兩邊都安全
-- (即使兩條 connection 都跑這個 SQL 也不會撞)

CREATE TABLE IF NOT EXISTS hosts (
    id               TEXT PRIMARY KEY,
    display_name     TEXT NOT NULL UNIQUE,
    ssh_host         TEXT NOT NULL,
    ssh_port         INTEGER NOT NULL DEFAULT 22,
    ssh_user         TEXT NOT NULL,
    auth_type        TEXT NOT NULL,
    private_key_path TEXT,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at     TEXT
);

CREATE TABLE IF NOT EXISTS ui_preferences (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quick_presets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL,
    payload    TEXT NOT NULL,
    send_enter INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS capture_cache (
    host_id      TEXT NOT NULL,
    session_name TEXT NOT NULL,
    content      TEXT NOT NULL,
    captured_at  TEXT NOT NULL,
    PRIMARY KEY (host_id, session_name)
);

-- TOFU server pubkey 信任記錄(每個 host 第一次連上記下 fingerprint,
-- 之後連線比對,不符 → 拒絕)。fingerprint 格式對齊 OpenSSH `ssh-keygen -lf`:
-- `SHA256:<unpadded base64>`,跟 makiko Pubkey::fingerprint() 一致。
CREATE TABLE IF NOT EXISTS host_keys (
    host_id       TEXT PRIMARY KEY,
    key_type      TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    first_seen_at TEXT NOT NULL
);
