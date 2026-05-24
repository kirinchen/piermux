import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    // host_status 走真 SSH 連線,不要每次 mount 都重打 — 30 秒內 cache
    staleTime: 30_000,
  });
}

export function useKillSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hostId, sessionName }: { hostId: string; sessionName: string }) =>
      api.killSession(hostId, sessionName),
    onSuccess: (_data, { hostId }) => {
      qc.invalidateQueries({ queryKey: sessionsKey(hostId) });
    },
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      hostId,
      sessionName,
      newName,
    }: {
      hostId: string;
      sessionName: string;
      newName: string;
    }) => api.renameSession(hostId, sessionName, newName),
    onSuccess: (_data, { hostId }) => {
      qc.invalidateQueries({ queryKey: sessionsKey(hostId) });
    },
  });
}
