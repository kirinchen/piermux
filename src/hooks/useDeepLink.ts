// deep link 收信端 —— 契約 doc/DEEP_LINK.md §5(冷啟動 / 熱啟動兩條路)。
//
// 冷啟動:URL 比視窗早到,Rust 存成 pending,這裡 mount 時取走(取走即清空,不重播)。
// 熱啟動:app 已開,Rust 發 `deep-link://attach` 事件過來。
//
// 兩條路都收斂成同一個「最新一筆待處理請求」;呼叫端處理完自己 consume()。
import * as React from "react";
import { api } from "@/lib/tauri";
import { onDeepLinkAttach, type AttachRequest } from "@/lib/deep-link";

export function useIncomingDeepLink() {
  const [req, setReq] = React.useState<AttachRequest | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    // 兩個都 safe-fail:Android / 瀏覽器 dev 沒有這條路,不該讓整個畫面掛掉。
    api
      .takePendingDeepLink()
      .then((r) => {
        if (!cancelled && r) setReq(r);
      })
      .catch(() => {});

    onDeepLinkAttach((r) => setReq(r))
      .then((off) => {
        if (cancelled) off();
        else unlisten = off;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const consume = React.useCallback(() => setReq(null), []);
  return { req, consume };
}
