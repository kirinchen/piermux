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
  // M1d — capture(三層 refresh,SPEC §3.3 / §6.3)
  captureSession: (hostId: string, sessionName: string) =>
    invoke<CaptureResult>("capture_session", { hostId, sessionName }),
  captureHost: (hostId: string) =>
    invoke<CaptureResult[]>("capture_host", { hostId }),
  captureAll: () => invoke<CaptureResult[]>("capture_all"),
  // M1f — attach(雙向 PTY,SPEC §3.2 / §6.5)
  attachSession: (
    hostId: string,
    sessionName: string,
    cols: number,
    rows: number,
  ) =>
    invoke<string>("attach_session", { hostId, sessionName, cols, rows }),
  // 直連 login shell,無 tmux(NOTES.md D-14)。回 attach_id,後續 write/resize/detach
  // 跟 attachSession 共用同一組 commands(都認 attach_id)
  attachShell: (hostId: string, cols: number, rows: number) =>
    invoke<string>("attach_shell", { hostId, cols, rows }),
  writeToSession: (sessionId: string, data: string) =>
    invoke<void>("write_to_session", { sessionId, data }),
  resizeSession: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_session", { sessionId, cols, rows }),
  detachSession: (sessionId: string) =>
    invoke<void>("detach_session", { sessionId }),
  // M1e — send_message(不 attach 直接送字 / 按鍵,SPEC §3.4 / §6.4)
  // literal=true → tmux send-keys -l(payload 視作 raw bytes,中文 / 特殊字 OK)
  // literal=false → tmux send-keys(payload 視作 tmux key spec,如 "Escape" / "C-l")
  sendMessage: (
    hostId: string,
    sessionName: string,
    payload: string,
    sendEnter: boolean,
    literal: boolean,
  ) =>
    invoke<void>("send_message", {
      hostId,
      sessionName,
      payload,
      sendEnter,
      literal,
    }),
};
