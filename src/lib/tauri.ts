import { invoke } from "@tauri-apps/api/core";
import type {
  CaptureResult,
  Host,
  HostConnectionStatus,
  HostForm,
  Session,
} from "./types";

// 對齊 backend `#[tauri::command]` 函式名(snake_case)。

export const api = {
  // M1b — host CRUD + test connection
  listHosts: () => invoke<Host[]>("list_hosts"),
  createHost: (form: HostForm) => invoke<Host>("create_host", { form }),
  updateHost: (id: string, form: HostForm) =>
    invoke<Host>("update_host", { id, form }),
  deleteHost: (id: string) => invoke<void>("delete_host", { id }),
  testConnection: (form: HostForm) => invoke<void>("test_connection", { form }),
  importPrivateKey: (filePath: string) =>
    invoke<string>("import_private_key", { filePath }),
  // M1c — sessions
  listSessions: (hostId: string) =>
    invoke<Session[]>("list_sessions", { hostId }),
  hostStatus: (hostId: string) =>
    invoke<HostConnectionStatus>("host_status", { hostId }),
  // SPEC §6.6 kill_session + rename + new(tree view session-level UX)。socket = D-39
  killSession: (hostId: string, socket: string, sessionName: string) =>
    invoke<void>("kill_session", { hostId, socket, sessionName }),
  renameSession: (
    hostId: string,
    socket: string,
    sessionName: string,
    newName: string,
  ) => invoke<void>("rename_session", { hostId, socket, sessionName, newName }),
  newSession: (hostId: string, socket: string, sessionName: string) =>
    invoke<void>("new_session", { hostId, socket, sessionName }),
  // M1d — capture(三層 refresh,SPEC §3.3 / §6.3)
  captureSession: (hostId: string, socket: string, sessionName: string) =>
    invoke<CaptureResult>("capture_session", { hostId, socket, sessionName }),
  captureHost: (hostId: string) =>
    invoke<CaptureResult[]>("capture_host", { hostId }),
  captureAll: () => invoke<CaptureResult[]>("capture_all"),
  // D-41 蒐證:pane 可見畫面純文字(無 ANSI、無 scrollback),給 grid diff 用
  captureScreen: (hostId: string, socket: string, sessionName: string) =>
    invoke<string>("capture_screen", { hostId, socket, sessionName }),
  // D-41 蒐證:flight recorder dump 寫進系統 temp,回傳完整路徑
  saveDebugDump: (fileStem: string, contents: string) =>
    invoke<string>("save_debug_dump", { fileStem, contents }),
  // D-41 b+:per-host tmux 字寬探針(拋棄式 socket,回 raw 輸出由前端 parse)
  probeHostWidths: (hostId: string, chars: string[]) =>
    invoke<string>("probe_host_widths", { hostId, chars }),
  // M1f — attach(雙向 PTY,SPEC §3.2 / §6.5)
  // D-41:attachId 由前端生成傳入 —— 呼叫端必須「先」用它掛好
  // attach-output/attach-closed listener 再 attach,不然初繪 bytes 會漏
  attachSession: (
    attachId: string,
    hostId: string,
    socket: string,
    sessionName: string,
    cols: number,
    rows: number,
  ) =>
    invoke<string>("attach_session", {
      attachId,
      hostId,
      socket,
      sessionName,
      cols,
      rows,
    }),
  // 直連 login shell,無 tmux(NOTES.md D-14)。回 attach_id,後續 write/resize/detach
  // 跟 attachSession 共用同一組 commands(都認 attach_id)
  attachShell: (attachId: string, hostId: string, cols: number, rows: number) =>
    invoke<string>("attach_shell", { attachId, hostId, cols, rows }),
  writeToSession: (sessionId: string, data: string) =>
    invoke<void>("write_to_session", { sessionId, data }),
  resizeSession: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_session", { sessionId, cols, rows }),
  detachSession: (sessionId: string) =>
    invoke<void>("detach_session", { sessionId }),
  // 滾輪在 alt-screen attach 時走 tmux copy-mode 看歷史(NOTES D-24)。
  // up=true 往回捲、lines=這次滾幾行。shell target 後端會 no-op。
  scrollSession: (sessionId: string, up: boolean, lines: number) =>
    invoke<void>("scroll_session", { sessionId, up, lines }),
  // M1e — send_message(不 attach 直接送字 / 按鍵,SPEC §3.4 / §6.4)
  // literal=true → tmux send-keys -l(payload 視作 raw bytes,中文 / 特殊字 OK)
  // literal=false → tmux send-keys(payload 視作 tmux key spec,如 "Escape" / "C-l")
  sendMessage: (
    hostId: string,
    socket: string,
    sessionName: string,
    payload: string,
    sendEnter: boolean,
    literal: boolean,
  ) =>
    invoke<void>("send_message", {
      hostId,
      socket,
      sessionName,
      payload,
      sendEnter,
      literal,
    }),
  // D-40 — 上傳本地檔到 remote pane 的 current pwd(只 tmux target)。
  // localPath = desktop 拖放給的本地路徑,後端自己讀檔。回完整遠端路徑給 toast。
  uploadToSession: (
    hostId: string,
    socket: string,
    sessionName: string,
    localPath: string,
  ) =>
    invoke<string>("upload_to_session", {
      hostId,
      socket,
      sessionName,
      localPath,
    }),
};
