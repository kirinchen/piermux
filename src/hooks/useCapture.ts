// M1d capture refresh mutations(SPEC §3.3 三層 refresh)。
//
// SessionPanel 自己處理 session-level capture(useEffect + Tauri event listener
// + 直接 imperative 寫進 xterm),所以這裡只放 host / all mutations 給
// HostTree / HostsView 上的按鈕用。
//
// 沒有 query / cache:capture content 直接 emit 給 SessionPanel 透過 Tauri
// event 接收,DB 上的 capture_cache 表 backend 自己 UPSERT(M2+ 才有「show
// stale + spinner」UX 需求)。
//
// 為什麼 onSuccess 要 invalidate sessions query:
// backend `capture_host` / `capture_all` 內部會重跑 `tmux list-sessions`
// (順便抓到新加 / rename / 刪掉的 session),但前端 `useSessions` 的
// cache 不會自己知道 — 不 invalidate 的話 tree 上 session 清單會卡舊的,
// 直到 user 自己重整 / 手動觸發。

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";

export function useRefreshHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostId: string) => api.captureHost(hostId),
    onSuccess: (_results, hostId) => {
      qc.invalidateQueries({ queryKey: ["sessions", "list", hostId] });
    },
  });
}

export function useRefreshAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.captureAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", "list"] });
    },
  });
}
