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
};
