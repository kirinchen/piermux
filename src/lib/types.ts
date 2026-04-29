// Mirrors src-tauri/src/hosts.rs Host / HostForm。
// snake_case keys 直接對齊 backend 跟 DB column 名,不轉 camelCase。

export type AuthType = "key" | "password";

export type Host = {
  id: string;
  display_name: string;
  ssh_host: string;
  ssh_port: number;
  ssh_user: string;
  auth_type: AuthType;
  private_key_path: string | null;
  sort_order: number;
  created_at: string;
  last_used_at: string | null;
};

export type HostForm = {
  display_name: string;
  ssh_host: string;
  ssh_port: number;
  ssh_user: string;
  auth_type: AuthType;
  private_key_path: string | null;
  password: string | null;
  sort_order: number;
};

export const emptyHostForm = (): HostForm => ({
  display_name: "",
  ssh_host: "",
  ssh_port: 22,
  ssh_user: "",
  auth_type: "key",
  private_key_path: null,
  password: null,
  sort_order: 0,
});

// Mirrors src-tauri/src/hosts.rs Session
export type Session = {
  name: string;
  attached: boolean;
  activity: string; // RFC3339
  windows: number;
};

// Mirrors src-tauri/src/hosts.rs HostConnectionStatus
export type HostConnectionStatus = "connected" | "disconnected" | "connecting";

export const hostToForm = (h: Host): HostForm => ({
  display_name: h.display_name,
  ssh_host: h.ssh_host,
  ssh_port: h.ssh_port,
  ssh_user: h.ssh_user,
  auth_type: h.auth_type,
  private_key_path: h.private_key_path,
  password: null, // 不從 backend 讀回密碼,改密碼要再填一次
  sort_order: h.sort_order,
});
