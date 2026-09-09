// D-41 b+:per-host tmux 字寬表 —— 探針、快取、套用。
//
// 為什麼:tmux 用「自己的」字寬表排版再送 client;xterm 用自己的。兩張表在
// emoji / VS16 / ambiguous 字元上不一致時,tmux 增量重繪的定位就錯位 → 行頭
// 殘字(NOTES D-41,dump3 實錄:host 舊 tmux 認 ⚠️=1、xterm 認 2)。Phase 0
// 證明本機 tmux 3.4 與 xterm 幾乎同表,但表跟 host 的 tmux 版本 / libc 綁定,
// 唯一可靠的做法是「對每台 host 量一次」(研究筆記 §3 選項 b+)。
//
// 流程:attach 時有快取 → 建 host provider 切過去(見 host-width-provider.ts);
// 沒快取 → 背景 probe(拋棄式 tmux socket,~10s,不碰既有 session),存
// localStorage,下一次 attach 生效(當次殘字由 D-37 自動重繪兜底)。
// 快取 key 含 tmux 版本由 probe 回報,host 升級 tmux 後想重量可清 localStorage
// `piermux:widths:<hostId>`(或之後做 UI)。

import type { Terminal } from "@xterm/xterm";
import { api } from "./tauri";
import { buildHostProvider } from "./host-width-provider";
import { getDefaultUnicodeVersion } from "./xterm-unicode";

// 探針字集:挑「兩張表最常吵架」的字 —— VS16 對(bare + ️ 版)、常見 emoji、
// East Asian Ambiguous、加上 sanity(A=1、中=2,錯了整張表作廢)與框線對照。
// 一字 ~70ms(respawn + sleep 0.05 + display-message),~130 字 ≈ 10s 背景。
export const PROBE_CHARS: string[] = [
  // sanity
  "A",
  "中",
  // VS16 對(bare, bare+FE0F)
  "⚠",
  "⚠️",
  "✔",
  "✔️",
  "✖",
  "✖️",
  "ℹ",
  "ℹ️",
  "❤",
  "❤️",
  "☀",
  "☀️",
  "☁",
  "☁️",
  "▶",
  "▶️",
  "✳",
  "✳️",
  "⏱",
  "⏱️",
  // 2600-27BF / misc symbols(單 codepoint)
  "✅",
  "❌",
  "⚡",
  "✨",
  "❗",
  "❓",
  "⛔",
  "⭕",
  "⭐",
  "☑",
  "⚙",
  "⏰",
  "⌛",
  "⏳",
  "✴",
  "❄",
  "☺",
  "☕",
  // 1F300+ emoji(CLI / claude 輸出高頻)
  "😀",
  "🚀",
  "🔥",
  "🎉",
  "👍",
  "🎨",
  "🔁",
  "💰",
  "💩",
  "🤖",
  "📊",
  "📝",
  "🔍",
  "📦",
  "🐛",
  "💡",
  "🧪",
  "📁",
  "📄",
  "🔒",
  "🔗",
  "🌐",
  "💾",
  "📌",
  "🎯",
  "🟡",
  "🟢",
  "🔴",
  "🟠",
  "🧭",
  "🛠",
  "🗑",
  // East Asian Ambiguous / 箭頭 / 幾何
  "±",
  "×",
  "÷",
  "→",
  "←",
  "↑",
  "↓",
  "⇒",
  "⇐",
  "•",
  "○",
  "●",
  "◎",
  "◆",
  "■",
  "□",
  "★",
  "☆",
  "°",
  "§",
  "…",
  "∞",
  "≠",
  "≤",
  "≥",
  "≈",
  "½",
  // 框線 / 塊(應全 1)
  "─",
  "│",
  "┌",
  "┘",
  "├",
  "┼",
  "═",
  "║",
  "█",
  "░",
  // braille / spinner
  "⠋",
  "⠙",
  "◐",
  "◒",
  // CJK 標點 / 全形
  "、",
  "。",
  "「",
  "」",
  ",",
  " ",
  ":",
  // powerline PUA
  "",
  "",
];

export interface WidthProfile {
  tmuxVersion: string;
  widths: Record<string, number>;
  probedAt: string;
}

const LS_PREFIX = "piermux:widths:";

export function getCachedProfile(hostId: string): WidthProfile | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + hostId);
    return raw ? (JSON.parse(raw) as WidthProfile) : null;
  } catch {
    return null;
  }
}

export function parseProbeOutput(raw: string): WidthProfile | null {
  let tmuxVersion = "";
  const widths: Record<string, number> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.startsWith("V:")) {
      tmuxVersion = t.slice(2).trim();
    } else if (t.startsWith("E:")) {
      console.warn(`[width-profile] probe 回報錯誤:${t}`);
      return null;
    } else if (t.startsWith("W:")) {
      const m = /^W:(\d+):(-?\d+)$/.exec(t);
      if (!m) continue;
      const ch = PROBE_CHARS[Number(m[1]) - 1];
      const w = Number(m[2]);
      if (ch !== undefined && w >= 0 && w <= 4) widths[ch] = w;
    }
  }
  // sanity:量錯(timing / 老 tmux 怪癖)寧可整張作廢,fallback 預設 provider
  if (widths["A"] !== 1 || widths["中"] !== 2) {
    console.warn("[width-profile] sanity 失敗(A/中 寬度不對),整張表作廢");
    return null;
  }
  return { tmuxVersion, widths, probedAt: new Date().toISOString() };
}

const inflight = new Map<string, Promise<WidthProfile | null>>();

/// probe + 存快取。同 host 同時只跑一條(回同一個 promise)。
export function probeProfile(hostId: string): Promise<WidthProfile | null> {
  const running = inflight.get(hostId);
  if (running) return running;
  const p = api
    .probeHostWidths(hostId, PROBE_CHARS)
    .then((raw) => {
      const prof = parseProbeOutput(raw);
      if (!prof) return null;
      try {
        localStorage.setItem(LS_PREFIX + hostId, JSON.stringify(prof));
      } catch {
        // localStorage 失敗就算了,下次 attach 再 probe
      }
      console.info(
        `[D-41] 字寬表已快取:tmux=${prof.tmuxVersion},${Object.keys(prof.widths).length} 字`,
      );
      return prof;
    })
    .catch((err) => {
      console.warn("[width-profile] probe failed", err);
      return null;
    })
    .finally(() => inflight.delete(hostId));
  inflight.set(hostId, p);
  return p;
}

function applyProfile(term: Terminal, hostId: string, prof: WidthProfile): boolean {
  try {
    const version = buildHostProvider(term, hostId, prof.widths);
    if (term.unicode.activeVersion !== version) {
      term.unicode.activeVersion = version;
      console.info(`[D-41] 套用 host 字寬表:${version}(tmux=${prof.tmuxVersion})`);
    }
    return true;
  } catch (err) {
    console.warn("[width-profile] 套用失敗,維持預設 provider", err);
    resetDefaultProvider(term);
    return false;
  }
}

/// attach 前呼叫(只限 tmux target)。有快取 → 註冊 host provider 並切換,回 true;
/// 沒快取 → 維持預設 provider、回 false,呼叫端接著 probeAndApply。
/// shell target 請改呼叫 resetDefaultProvider(直連沒有 tmux 中間人,host 表不適用)。
export function applyHostWidths(term: Terminal, hostId: string): boolean {
  const prof = getCachedProfile(hostId);
  if (!prof) {
    resetDefaultProvider(term);
    return false;
  }
  return applyProfile(term, hostId, prof);
}

/// D-43:沒快取時 —— 背景 probe,量完「當場」套用到這顆 term(不再等下次
/// attach)。回 true 表示已切換,呼叫端接著整屏重畫一次讓既有畫面按新表重排。
export async function probeAndApply(term: Terminal, hostId: string): Promise<boolean> {
  const prof = await probeProfile(hostId);
  if (!prof) return false;
  return applyProfile(term, hostId, prof);
}

export function resetDefaultProvider(term: Terminal): void {
  const def = getDefaultUnicodeVersion();
  if (def && term.unicode.activeVersion !== def) {
    term.unicode.activeVersion = def;
  }
}
