// piermux:// deep link 前端側 —— 契約在 doc/DEEP_LINK.md。
//
// 這裡只有「解析好的請求怎麼對到既有 host」這段純邏輯 + 事件訂閱。
// URL 解析在 Rust(src-tauri/src/deep_link.rs),前端不重做一份。
import { listen } from "@tauri-apps/api/event";
import type { Host } from "./types";

/** 對齊 Rust `deep_link::AttachRequest`。就兩個字串,沒有 id、沒有指令。 */
export type AttachRequest = {
  host: string;
  session: string;
};

/** 對齊 Rust `deep_link::ATTACH_EVENT`。 */
export const ATTACH_EVENT = "deep-link://attach";

/**
 * 契約 §2 的 host 解析:`display_name` 優先(該欄 UNIQUE),再退 `ssh_host`(**不唯一**)。
 * 一律不分大小寫。回傳命中的 host 陣列 —— 長度 1 才能直接 attach,0 或 >1 都要人挑。
 */
export function matchHosts(hosts: Host[], needle: string): Host[] {
  const want = needle.trim().toLowerCase();
  if (!want) return [];
  const byName = hosts.filter(
    (h) => h.display_name.trim().toLowerCase() === want,
  );
  if (byName.length > 0) return byName;
  return hosts.filter((h) => h.ssh_host.trim().toLowerCase() === want);
}

/** 熱啟動:app 已經開著,Rust 收到 URL 後發事件過來。回傳 unlisten。 */
export function onDeepLinkAttach(cb: (req: AttachRequest) => void) {
  return listen<AttachRequest>(ATTACH_EVENT, (e) => cb(e.payload));
}
