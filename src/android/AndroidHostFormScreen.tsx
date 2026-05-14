import { useState } from "react";
import { toast } from "sonner";
import { useCreateHost, useUpdateHost, useTestConnection } from "@/hooks/useHosts";
import { emptyHostForm, hostToForm } from "@/lib/types";
import type { AuthType, Host, HostForm } from "@/lib/types";
import { api } from "@/lib/tauri";

type Props = {
  // null = create mode;Host = edit mode(預填)
  editing: Host | null;
  onClose: () => void;
};

export function AndroidHostFormScreen({ editing, onClose }: Props) {
  const isEdit = editing !== null;
  const [form, setForm] = useState<HostForm>(() =>
    editing ? hostToForm(editing) : emptyHostForm(),
  );
  const create = useCreateHost();
  const update = useUpdateHost();
  const test = useTestConnection();

  const set =
    <K extends keyof HostForm>(key: K) =>
    (value: HostForm[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const submitting = create.isPending || update.isPending;

  const handleSave = async () => {
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, form });
        toast.success(`已更新 ${form.display_name}`);
      } else {
        await create.mutateAsync(form);
        toast.success(`已加入 ${form.display_name}`);
      }
      onClose();
    } catch (err) {
      toast.error(`儲存失敗:${String(err)}`);
    }
  };

  const handleTest = async () => {
    try {
      await test.mutateAsync(form);
      toast.success("連線成功");
    } catch (err) {
      toast.error(`連線失敗:${String(err)}`);
    }
  };

  const handleImportKey = async () => {
    const path = window.prompt("貼上私鑰絕對路徑");
    if (!path) return;
    try {
      const abs = await api.importPrivateKey(path);
      set("private_key_path")(abs);
      toast.success(`已選 ${abs}`);
    } catch (err) {
      toast.error(`匯入失敗:${String(err)}`);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-2 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm active:bg-zinc-800"
          disabled={submitting}
        >
          ‹ Cancel
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">
          {isEdit ? "編輯 Host" : "新增 Host"}
        </h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white active:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "…" : "儲存"}
        </button>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="顯示名稱" required>
          <input
            className={inputCls}
            value={form.display_name}
            onChange={(e) => set("display_name")(e.target.value)}
            placeholder="kirin-mint-1"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="SSH host" required>
              <input
                className={inputCls}
                value={form.ssh_host}
                onChange={(e) => set("ssh_host")(e.target.value)}
                placeholder="100.x.y.z 或 hostname"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="url"
              />
            </Field>
          </div>
          <Field label="Port" required>
            <input
              className={inputCls}
              type="number"
              value={form.ssh_port}
              onChange={(e) => set("ssh_port")(Number(e.target.value) || 22)}
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="使用者" required>
          <input
            className={inputCls}
            value={form.ssh_user}
            onChange={(e) => set("ssh_user")(e.target.value)}
            placeholder="kirin"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>

        <Field label="認證方式" required>
          <select
            className={inputCls}
            value={form.auth_type}
            onChange={(e) => set("auth_type")(e.target.value as AuthType)}
          >
            <option value="key">私鑰(key)</option>
            <option value="password">密碼(password)</option>
          </select>
        </Field>

        {form.auth_type === "key" && (
          <Field label="私鑰檔絕對路徑">
            <div className="flex gap-2">
              <input
                className={inputCls + " flex-1"}
                value={form.private_key_path ?? ""}
                onChange={(e) =>
                  set("private_key_path")(e.target.value || null)
                }
                placeholder="/storage/emulated/0/keys/id_ed25519"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <button
                type="button"
                onClick={handleImportKey}
                className="rounded-md bg-zinc-800 px-3 py-2 text-sm active:bg-zinc-700"
                title="貼路徑匯入"
              >
                🔑
              </button>
            </div>
          </Field>
        )}

        {form.auth_type === "password" && (
          <Field label={isEdit ? "密碼(留空 = 不變)" : "密碼"}>
            <input
              className={inputCls}
              type="password"
              value={form.password ?? ""}
              onChange={(e) => set("password")(e.target.value || null)}
              placeholder="••••••••"
              autoCapitalize="none"
            />
          </Field>
        )}

        <Field label="排序(數字越小越上面)">
          <input
            className={inputCls}
            type="number"
            value={form.sort_order}
            onChange={(e) => set("sort_order")(Number(e.target.value) || 0)}
            inputMode="numeric"
          />
        </Field>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={test.isPending}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium active:bg-zinc-800 disabled:opacity-50"
          >
            {test.isPending ? "測試中…" : "測試連線"}
          </button>
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}
