import { invoke } from "@tauri-apps/api/core";
import type { Host, HostForm } from "./types";

// 6 個 backend commands 的薄 wrapper。invoke 名字對齊 src-tauri/src/commands.rs
// #[tauri::command] function 名(snake_case)。

export const api = {
  listHosts: () => invoke<Host[]>("list_hosts"),
  createHost: (form: HostForm) => invoke<Host>("create_host", { form }),
  updateHost: (id: string, form: HostForm) =>
    invoke<Host>("update_host", { id, form }),
  deleteHost: (id: string) => invoke<void>("delete_host", { id }),
  testConnection: (form: HostForm) => invoke<void>("test_connection", { form }),
  importPrivateKey: (filePath: string) =>
    invoke<string>("import_private_key", { filePath }),
};
