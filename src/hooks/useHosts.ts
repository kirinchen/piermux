// TanStack Query hooks。query key 用 [域, 動作, ...參數](CLAUDE.md 規則)。

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import type { Host, HostForm } from "@/lib/types";

const HOSTS_KEY = ["hosts", "list"] as const;

export function useHostsList() {
  return useQuery({
    queryKey: HOSTS_KEY,
    queryFn: api.listHosts,
  });
}

export function useCreateHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: HostForm) => api.createHost(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOSTS_KEY }),
  });
}

export function useUpdateHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, form }: { id: string; form: HostForm }) =>
      api.updateHost(id, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOSTS_KEY }),
  });
}

export function useDeleteHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteHost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOSTS_KEY }),
  });
}

export function useTestConnection() {
  // 不 invalidate cache,純驗連線
  return useMutation<void, Error, HostForm>({
    mutationFn: api.testConnection,
  });
}

// 給 useDeleteHost 用的 helper:確認對話 + delete + toast
export function useDeleteHostWithConfirm() {
  const del = useDeleteHost();
  return (host: Host, onConfirm: () => boolean | Promise<boolean>) =>
    Promise.resolve(onConfirm()).then((ok) => {
      if (!ok) return Promise.resolve();
      return del.mutateAsync(host.id);
    });
}
