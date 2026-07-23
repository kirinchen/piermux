// 終端外觀設定(D-35)。SPEC §11 backlog「設定面板(theme / font size)」的第一刀,
// 這版只做字型 + 字級 —— theme / 預設 input mode 之後再加。
//
// 改動即時生效(不用按確定):`saveTermPrefs` 廣播 → 所有活著的 xterm 換 options
// 並 refit。attach 中的 session 不會被踢掉。

import * as React from "react";
import { RotateCcw } from "lucide-react";
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
  DEFAULT_PREFS,
  FONT_PRESETS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  saveTermPrefs,
} from "@/lib/term-prefs";
import { useTermPrefs } from "@/lib/useTermPrefs";

// Select 的「自訂…」用一個不可能撞到 font stack 的哨兵值
const CUSTOM = "__custom__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: Props) {
  const prefs = useTermPrefs();
  const isPreset = FONT_PRESETS.some((p) => p.value === prefs.fontFamily);
  // 使用者按了「自訂…」但還沒打字時,下拉要停在自訂而不是跳回 preset
  const [customMode, setCustomMode] = React.useState(!isPreset);
  React.useEffect(() => {
    if (open) setCustomMode(!isPreset);
    // 只在開啟當下同步一次;開著的時候由使用者的選擇主導
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setFamily = (fontFamily: string) =>
    saveTermPrefs({ ...prefs, fontFamily });
  const setSize = (fontSize: number) => saveTermPrefs({ ...prefs, fontSize });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>終端設定</DialogTitle>
          <DialogDescription>
            字型與字級套用到所有終端畫面(attach / capture / grid),改完即時生效。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="font-family">字型</Label>
            <Select
              value={customMode ? CUSTOM : prefs.fontFamily}
              onValueChange={(v) => {
                if (v === CUSTOM) {
                  setCustomMode(true);
                  return;
                }
                setCustomMode(false);
                setFamily(v);
              }}
            >
              <SelectTrigger id="font-family">
                <SelectValue placeholder="選字型" />
              </SelectTrigger>
              <SelectContent>
                {FONT_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>自訂…</SelectItem>
              </SelectContent>
            </Select>
            {customMode && (
              <>
                <Input
                  value={prefs.fontFamily}
                  onChange={(e) => setFamily(e.target.value)}
                  placeholder='例如:"Cascadia Code", monospace'
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  CSS font-family 語法。字型要先裝在這台機器上才有效,建議結尾留一個
                  <code className="mx-1">monospace</code>當 fallback。
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="font-size">
              字級 <span className="text-muted-foreground">{prefs.fontSize}px</span>
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSize(prefs.fontSize - 1)}
                disabled={prefs.fontSize <= FONT_SIZE_MIN}
                aria-label="縮小字級"
              >
                A−
              </Button>
              <input
                id="font-size"
                type="range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                value={prefs.fontSize}
                onChange={(e) => setSize(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-primary"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSize(prefs.fontSize + 1)}
                disabled={prefs.fontSize >= FONT_SIZE_MAX}
                aria-label="放大字級"
              >
                A+
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Grid 的 mini cell 會自動小 2px,Android attach 小 1px。
            </p>
          </div>

          <div className="space-y-1">
            <Label>預覽</Label>
            <div
              className="overflow-x-auto whitespace-pre rounded-md border border-border bg-[#0a0a0a] p-3 text-[#e5e5e5]"
              style={{
                fontFamily: prefs.fontFamily,
                fontSize: prefs.fontSize,
                lineHeight: 1.2,
              }}
            >
              {PREVIEW}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCustomMode(false);
              saveTermPrefs(DEFAULT_PREFS);
            }}
          >
            <RotateCcw className="h-4 w-4" />
            還原預設
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 對齊/寬度容易出包的字都放進來:0O1lI 分辨度、box drawing、CJK、emoji(D-28 寬度)
const PREVIEW = [
  "$ tmux ls   0O1lI  ── │ ┌─┐ └─┘",
  "piermux ✅ 跨多機 tmux session ⚠️",
  "https://github.com/kirinchen/piermux",
].join("\n");
