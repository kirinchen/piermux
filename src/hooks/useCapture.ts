// M1d capture refresh mutations(SPEC §3.3 三層 refresh)。
//
// SessionPanel 自己處理 session-level capture(useEffect + Tauri event listener
// + 直接 imperative 寫進 xterm),所以這裡只放 host / all mutations 給
// HostTree / HostsView 上的按鈕用。
//
// 沒有 query / cache:capture content 直接 emit 給 SessionPanel 透過 Tauri
// event 接收,DB 上的 capture_cache 表 backend 自己 UPSERT(M2+ 才有「show
// stale + spinner」UX 需求)。

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/tauri";

export function useRefreshHost() {
  return useMutation({
    mutationFn: (hostId: string) => api.captureHost(hostId),
  });
}

export function useRefreshAll() {
  return useMutation({
    mutationFn: () => api.captureAll(),
  });
}
