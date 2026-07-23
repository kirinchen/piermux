// 終端裡的網址 → 點一下用系統預設瀏覽器開(D-36)。
//
// 掛在四個 xterm(desktop SessionPanel / CaptureCell、Android capture / attach)。
// xterm 內建的 WebLinksAddon 預設 handler 是 `window.open`,在 Tauri WebView 裡
// 不是被擋掉就是在 app 內開一個沒 chrome 的視窗 —— 兩種都不是使用者要的。
// 改成走 `tauri-plugin-opener` 的 `openUrl`,交給 OS 預設瀏覽器
// (Android 則是 Intent → 系統瀏覽器)。

import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import type { Terminal } from "@xterm/xterm";

// 只放行 http/https。終端內容來自遠端,不該讓它誘導我們去 open 任意 scheme
// (file: / 自訂 protocol handler 等)。plugin 端 capability 也有 scope,雙保險。
const ALLOWED_SCHEME = /^https?:\/\//i;

/** 給一個 xterm 掛「點網址開瀏覽器」。要在 `term.open()` 前後皆可,慣例跟其他 addon 一起。 */
export function installWebLinks(term: Terminal): void {
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      if (!ALLOWED_SCHEME.test(uri)) {
        toast.error(`不支援的連結:${uri}`);
        return;
      }
      openUrl(uri).catch((err) => {
        console.warn("[xterm-links] openUrl failed", err);
        toast.error(`開啟連結失敗:${String(err)}`);
      });
    }),
  );
}
