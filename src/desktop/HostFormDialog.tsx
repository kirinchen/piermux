import * as React from "react";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateHost,
  useUpdateHost,
  useTestConnection,
} from "@/hooks/useHosts";
import { emptyHostForm, hostToForm } from "@/lib/types";
import type { AuthType, Host, HostForm } from "@/lib/types";
import { api } from "@/lib/tauri";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 沒給 = add mode;給了 = edit mode(預填 host 欄位)
  editing?: Host | null;
};

export function HostFormDialog({ open, onOpenChange, editing }: Props) {
  const isEdit = Boolean(editing);
  const [form, setForm] = React.useState<HostForm>(emptyHostForm);
  const create = useCreateHost();
  const update = useUpdateHost();
  const test = useTestConnection();

  // editing 變動時同步表單
  React.useEffect(() => {
    if (open) setForm(editing ? hostToForm(editing) : emptyHostForm());
  }, [open, editing]);

  const set =
    <K extends keyof HostForm>(key: K) =>
    (value: HostForm[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, form });
        toast.success(`已更新 ${form.display_name}`);
      } else {
        await create.mutateAsync(form);
        toast.success(`已加入 ${form.display_name}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`儲存失敗:${String(err)}`);
    }
  };

  const handleTest = async () => {
    try {
      await test.mutateAsync(form);
      toast.success("連線成功");
    } catch (err) {
      // M1b/1.5 之前 stub 會回 "test_connection 暫時下線 ..." — 直接顯示
      toast.error(`連線失敗:${String(err)}`);
    }
  };

  const handleImportKey = async () => {
    // M1b 階段沒接 file picker(tauri-plugin-dialog 還沒裝),
    // 先 prompt 讓 user 貼路徑進來。M1c 再升級 file picker。
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

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯 Host" : "新增 Host"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "改完按儲存。密碼留空表示不變動。"
              : "填寫 SSH 連線資訊。密碼會存到 OS keystore,不寫進 DB。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <FieldRow label="顯示名稱" required>
            <Input
              value={form.display_name}
              onChange={(e) => set("display_name")(e.target.value)}
              placeholder="kirin-mint-1"
            />
          </FieldRow>

          <div className="grid grid-cols-3 gap-2">
            <FieldRow label="SSH host" required className="col-span-2">
              <Input
                value={form.ssh_host}
                onChange={(e) => set("ssh_host")(e.target.value)}
                placeholder="100.x.y.z 或 hostname"
              />
            </FieldRow>
            <FieldRow label="Port" required>
              <Input
                type="number"
                value={form.ssh_port}
                onChange={(e) =>
                  set("ssh_port")(Number(e.target.value) || 22)
                }
              />
            </FieldRow>
          </div>

          <FieldRow label="使用者" required>
            <Input
              value={form.ssh_user}
              onChange={(e) => set("ssh_user")(e.target.value)}
              placeholder="kirin"
            />
          </FieldRow>

          <FieldRow label="認證方式" required>
            <Select
              value={form.auth_type}
              onValueChange={(v) => set("auth_type")(v as AuthType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="key">私鑰(key)</SelectItem>
                <SelectItem value="password">密碼(password)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          {form.auth_type === "key" && (
            <FieldRow label="私鑰檔絕對路徑">
              <div className="flex gap-2">
                <Input
                  value={form.private_key_path ?? ""}
                  onChange={(e) =>
                    set("private_key_path")(e.target.value || null)
                  }
                  placeholder="C:\Users\<you>\.ssh\id_ed25519"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleImportKey}
                  title="匯入私鑰(prompt 貼路徑)"
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              </div>
            </FieldRow>
          )}

          {form.auth_type === "password" && (
            <FieldRow label={isEdit ? "密碼(留空 = 不變)" : "密碼"}>
              <Input
                type="password"
                value={form.password ?? ""}
                onChange={(e) => set("password")(e.target.value || null)}
                placeholder="••••••••"
              />
            </FieldRow>
          )}

          <FieldRow label="排序(數字越小越上面)">
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order")(Number(e.target.value) || 0)}
            />
          </FieldRow>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={test.isPending}
          >
            {test.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                測試中
              </>
            ) : (
              "測試連線"
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                儲存中
              </>
            ) : (
              "儲存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
