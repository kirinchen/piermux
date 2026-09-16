// 從 tmux capture 的畫面文字判定 session 狀態 —— heuristic 移植自 seamount
// `aggregate.py collect_tmux()` 的「畫面 chrome 層」(A4,純計算、零 LLM)。
//
// 四態對齊 seamount `web/src/types.ts` 的 TmuxState:
//   busy_fg   生成中(前台 agent 在跑,底部有 `esc to interrupt`)
//   busy_agents 背景 agent(`agents running/done` / `monitors`)
//   wait_input 等你回覆(prompt 框有草稿,或最後回話含問句)
//   idle      告一段落(以上皆非;也是所有 fallback 的落點)
//
// 限制(piermux 目前 capture 只有畫面文字,沒有 pane metadata):
//   - 沒有 seamount 的「agent 閘門」(#{pane_current_command}) —— 非 agent pane
//     靠 marker 稀有性自然落 idle,但理論上會被問句 regex 誤判。
//   - 摘要只能取畫面 body;seamount 優先用 OSC #{pane_title} 的任務名,我們拿不到。
//   - 沒有 copy-mode 保護(#{pane_in_mode})。
//   要補這些得後端在 session list 多帶欄位(第二刀)。
// marker 隨 Claude Code 版本會改,當契約盯(seamount doc/SPEC.md §… 同此警告)。

export type SessionState = "busy_fg" | "busy_agents" | "wait_input" | "idle";

export type SessionStatus = {
  state: SessionState;
  emoji: string;
  label: string;
  summary: string | null; // idle=結論 / wait=問題(畫面 body 最後幾行)
  draft: string | null; // prompt 框內未送出的草稿(owner 打了沒送)
};

const STATE_META: Record<SessionState, { emoji: string; label: string }> = {
  busy_fg: { emoji: "🏃", label: "生成中" },
  busy_agents: { emoji: "🏃", label: "背景 agent" },
  wait_input: { emoji: "🙋", label: "等你回覆" },
  idle: { emoji: "☑️", label: "告一段落" },
};

// 框線字元(seamount `_RULE_CHARS`)
const RULE_CHARS = new Set([..."─━╌┄┈╭╮╰╯┌┐└┘├┤│ "]);
const H_LINE = "─━╌┄┈";
// 整行只有框線字元、且含至少一個水平線
function isRule(ln: string): boolean {
  const s = ln.trim();
  if (!s) return false;
  for (const ch of s) if (!RULE_CHARS.has(ch)) return false;
  return [...s].some((ch) => H_LINE.includes(ch));
}

const PROMPT_NOISE = ["for agents", "to manage", "esc to interrupt"];
// 「等你回覆」問句 marker(seamount `:289`)
const QUESTION_RE = /[?？]|還是|要不要|要我.{0,8}嗎|嗎[?？]/;
// body summary 要濾掉的行首字元(✻●⎿·$ = agent chrome / ❯> = owner 自己說的話)
const BODY_SKIP_PREFIX = "✻●⎿·$❯>";

// prompt 框 = 從底往上第二條水平框線之後、到最後一條之前(seamount `_prompt_box`)。
// 不用「最後一個 ❯」——Claude TUI 把已送出的 owner 訊息也用 ❯ 印在對話區。
function promptBox(
  lines: string[],
): { box: string[]; above: string[] } | null {
  const rules: number[] = [];
  lines.forEach((ln, i) => {
    if (isRule(ln)) rules.push(i);
  });
  if (rules.length < 2) return null;
  const top = rules[rules.length - 2];
  const bot = rules[rules.length - 1];
  return { box: lines.slice(top + 1, bot), above: lines.slice(0, top) };
}

// 一行框內文字:去掉框側邊 │┃、prompt 標記 >/❯、頭尾空白
function cleanBoxLine(l: string): string {
  return l
    .replace(/[│┃]/g, " ")
    .trim()
    .replace(/^[>❯]\s?/, "")
    .trim();
}
function draftOf(box: string[]): string | null {
  const parts = box
    .map(cleanBoxLine)
    .filter(
      (l) => l && !PROMPT_NOISE.some((n) => l.toLowerCase().includes(n)),
    );
  return parts.join(" ").trim() || null;
}

function bodySummary(
  above: string[],
  maxLines = 7,
  maxChars = 400,
): string | null {
  const kept = above.filter((raw) => {
    const t = raw.trim();
    if (!t) return false;
    if (isRule(raw)) return false;
    if (BODY_SKIP_PREFIX.includes(t[0])) return false;
    return true;
  });
  if (kept.length === 0) return null;
  let s = kept
    .slice(-maxLines)
    .map((l) => l.trim())
    .join(" ")
    .trim();
  if (s.length > maxChars) s = s.slice(0, maxChars) + "…";
  return s || null;
}

/** 純畫面文字(已 strip ANSI)→ 狀態。 */
export function detectSessionStatus(screen: string): SessionStatus {
  const lines = screen.replace(/\r/g, "").split("\n");
  const lower = screen.toLowerCase();
  const bottomLower = lines.slice(-6).join("\n").toLowerCase();

  const bgAgents =
    /agents (running|done)/.test(lower) || bottomLower.includes("monitors");
  const screenBusy =
    bottomLower.includes("esc to interrupt") ||
    /agents (running|done)/.test(lower) ||
    (bottomLower.includes("monitors") && bottomLower.includes("esc"));

  const pb = promptBox(lines);
  const draft = pb ? draftOf(pb.box) : null;
  const summary = bodySummary(pb ? pb.above : lines);

  let state: SessionState;
  if (screenBusy) {
    state = bgAgents ? "busy_agents" : "busy_fg";
  } else if (draft || (summary != null && QUESTION_RE.test(summary))) {
    state = "wait_input";
  } else {
    state = "idle";
  }

  const meta = STATE_META[state];
  return { state, emoji: meta.emoji, label: meta.label, summary, draft };
}

// eslint-disable-next-line no-control-regex
const ANSI_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// eslint-disable-next-line no-control-regex
const ANSI_ESC = /\x1b[@-Z\\-_]/g;

/** 去掉 ANSI CSI / OSC / 其他 ESC 序列,留純文字。 */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_CSI, "").replace(ANSI_OSC, "").replace(ANSI_ESC, "");
}
