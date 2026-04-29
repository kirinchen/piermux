import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";

// Query keys 結構 [域, 動作, ...參數](CLAUDE.md)
const sessionsKey = (hostId: string) => ["sessions", "list", hostId] as const;
const statusKey = (hostId: string) => ["host", "status", hostId] as const;

export function useSessions(hostId: string, enabled = true) {
  return useQuery({
    queryKey: sessionsKey(hostId),
    queryFn: () => api.listSessions(hostId),
    enabled,
  });
}

export function useHostStatus(hostId: string) {
  return useQuery({
    queryKey: statusKey(hostId),
    queryFn: () => api.hostStatus(hostId),
  });
}
