// 終端外觀偏好(字型 + 大小),SPEC §11 backlog「設定面板(theme / font size)」的第一刀。
//
// 存 localStorage 而不是 `ui_preferences` 表(D-35):xterm 建構當下就要拿到值,
// 走 DB 得先 await 才能 open() → 會先用預設值畫一次再重畫(閃一下 + attach 多一次
// resize)。localStorage 是同步的,而且 sidebar 收合狀態(`piermux:sidebarCollapsed`)
// 已經用同一套。之後若要跨機同步偏好再搬進 DB。
//
// 改動走 `saveTermPrefs()` → 寫 storage + 廣播 event → 所有活著的 xterm 即時套用,
// 不用 remount(attach 中的 session 不會被踢掉)。

/** 使用者可調的終端外觀。 */
export type TermPrefs = {
  /** CSS font-family 字串,直接餵給 xterm `fontFamily`。 */
  fontFamily: string;
  /** 主要終端(attach / capture 全畫面)的字級 px。mini cell 會自己減。 */
  fontSize: number;
};

const STORAGE_KEY = "piermux:termPrefs";

/** 預設字型堆疊 —— 跟 D-35 之前寫死在各 xterm 的那串一致。 */
export const DEFAULT_FONT_FAMILY =
  '"JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const DEFAULT_PREFS: TermPrefs = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 13,
};

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 28;

/** 設定面板的字型下拉選單。value 是實際餵給 xterm 的 font stack。 */
export const FONT_PRESETS: { label: string; value: string }[] = [
  { label: "預設等寬(JetBrains Mono → 系統)", value: DEFAULT_FONT_FAMILY },
  { label: "系統等寬(monospace)", value: "monospace" },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", monospace' },
  { label: "Cascadia Code / Consolas", value: '"Cascadia Code", Consolas, monospace' },
  { label: "DejaVu Sans Mono", value: '"DejaVu Sans Mono", monospace' },
  { label: "Liberation Mono", value: '"Liberation Mono", monospace' },
  { label: "Menlo / Monaco", value: "Menlo, Monaco, monospace" },
  { label: "Noto Sans Mono CJK", value: '"Noto Sans Mono CJK TC", "Noto Sans Mono", monospace' },
  { label: "Ubuntu Mono", value: '"Ubuntu Mono", monospace' },
];

function clampSize(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : DEFAULT_PREFS.fontSize;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, v));
}

/** 同步讀偏好。壞掉 / 沒設過都回預設,永遠不會 throw。 */
export function loadTermPrefs(): TermPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFS;
    const obj = parsed as Record<string, unknown>;
    const fontFamily =
      typeof obj.fontFamily === "string" && obj.fontFamily.trim()
        ? obj.fontFamily
        : DEFAULT_PREFS.fontFamily;
    return { fontFamily, fontSize: clampSize(obj.fontSize) };
  } catch {
    return DEFAULT_PREFS;
  }
}

// --- 極簡 store:snapshot 只在真的變動時換 identity,給 useSyncExternalStore 用 ---

let snapshot: TermPrefs | null = null;
const listeners = new Set<() => void>();

function refresh(): void {
  snapshot = loadTermPrefs();
  for (const l of listeners) l();
}

/** 目前偏好(快取過的 stable reference)。 */
export function getTermPrefs(): TermPrefs {
  if (!snapshot) snapshot = loadTermPrefs();
  return snapshot;
}

/** 寫偏好 + 廣播給所有活著的終端即時套用。 */
export function saveTermPrefs(prefs: TermPrefs): void {
  const normalized: TermPrefs = {
    fontFamily: prefs.fontFamily.trim() || DEFAULT_PREFS.fontFamily,
    fontSize: clampSize(prefs.fontSize),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // quota / SecurityError —— 這輪還是廣播,至少當下 session 有效
  }
  snapshot = normalized;
  for (const l of listeners) l();
}

/** 訂閱偏好變更。回傳退訂函式。 */
export function subscribeTermPrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// 其他 window(desktop 之後若開多視窗)改動 localStorage 時同步過來
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) refresh();
  });
}

/**
 * 各 xterm 用的實際字級。`delta` 讓小畫面維持原本的相對關係:
 * grid mini cell -2、Android attach -1、其餘 0(對齊 D-35 之前寫死的 11 / 12 / 13)。
 */
export function fontSizeFor(prefs: TermPrefs, delta = 0): number {
  return Math.max(FONT_SIZE_MIN, prefs.fontSize + delta);
}
