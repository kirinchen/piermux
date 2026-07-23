// Android 終端設定(D-35)。對齊 AndroidHostFormScreen 的全屏 + 原生控件 pattern
// (行動端不用 desktop 的 modal dialog),走 stack navigation push/pop。
//
// 改動即時生效:`saveTermPrefs` 廣播 → 回上一頁時 attach / capture 的 xterm 已經換好。

import { useState } from "react";
import {
  DEFAULT_PREFS,
  FONT_PRESETS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  saveTermPrefs,
} from "@/lib/term-prefs";
import { useTermPrefs } from "@/lib/useTermPrefs";

const CUSTOM = "__custom__";

type Props = {
  onBack: () => void;
};

export function SettingsScreen({ onBack }: Props) {
  const prefs = useTermPrefs();
  const isPreset = FONT_PRESETS.some((p) => p.value === prefs.fontFamily);
  const [customMode, setCustomMode] = useState(!isPreset);

  const setFamily = (fontFamily: string) =>
    saveTermPrefs({ ...prefs, fontFamily });
  const setSize = (fontSize: number) => saveTermPrefs({ ...prefs, fontSize });

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100 pt-safe pb-safe">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-2 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-2 text-sm active:bg-zinc-800"
        >
          ‹
        </button>
        <h1 className="flex-1 text-base font-semibold">終端設定</h1>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="space-y-2">
          <label
            htmlFor="font-family"
            className="block text-sm font-medium text-zinc-300"
          >
            字型
          </label>
          <select
            id="font-family"
            value={customMode ? CUSTOM : prefs.fontFamily}
            onChange={(e) => {
              const v = e.target.value;
              if (v === CUSTOM) {
                setCustomMode(true);
                return;
              }
              setCustomMode(false);
              setFamily(v);
            }}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-base"
          >
            {FONT_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM}>自訂…</option>
          </select>
          {customMode && (
            <>
              <input
                value={prefs.fontFamily}
                onChange={(e) => setFamily(e.target.value)}
                placeholder='例如:"Noto Sans Mono", monospace'
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-3 text-base"
              />
              <p className="text-xs text-zinc-500">
                手機上多半只有系統內建的等寬字型可用,結尾建議留 monospace 當
                fallback。
              </p>
            </>
          )}
        </section>

        <section className="space-y-3">
          <label
            htmlFor="font-size"
            className="block text-sm font-medium text-zinc-300"
          >
            字級 <span className="text-zinc-500">{prefs.fontSize}px</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSize(prefs.fontSize - 1)}
              disabled={prefs.fontSize <= FONT_SIZE_MIN}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-base active:bg-zinc-800 disabled:opacity-40"
            >
              A−
            </button>
            <input
              id="font-size"
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={prefs.fontSize}
              onChange={(e) => setSize(Number(e.target.value))}
              className="h-2 flex-1 accent-blue-500"
            />
            <button
              type="button"
              onClick={() => setSize(prefs.fontSize + 1)}
              disabled={prefs.fontSize >= FONT_SIZE_MAX}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-base active:bg-zinc-800 disabled:opacity-40"
            >
              A+
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Attach 畫面會自動小 1px(手機寬度要塞得下 tmux 的欄數)。
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium text-zinc-300">預覽</p>
          <div
            className="overflow-x-auto whitespace-pre rounded-md border border-zinc-800 bg-[#0a0a0a] p-3 text-[#e5e5e5]"
            style={{
              fontFamily: prefs.fontFamily,
              fontSize: prefs.fontSize,
              lineHeight: 1.2,
            }}
          >
            {PREVIEW}
          </div>
        </section>

        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            saveTermPrefs(DEFAULT_PREFS);
          }}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm active:bg-zinc-800"
        >
          還原預設
        </button>
      </main>
    </div>
  );
}

// 對齊/寬度容易出包的字都放進來:0O1lI 分辨度、box drawing、CJK、emoji(D-28 寬度)
const PREVIEW = [
  "$ tmux ls  0O1lI ── │ ┌─┐",
  "piermux ✅ 跨多機 tmux ⚠️",
  "https://github.com/kirinchen",
].join("\n");
