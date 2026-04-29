// Native Intl.RelativeTimeFormat,不引 date-fns 等 dep。
// "zh-TW" locale 顯示「5 分鐘前」這種語感。

const rtf = new Intl.RelativeTimeFormat("zh-TW", { numeric: "auto" });

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}
