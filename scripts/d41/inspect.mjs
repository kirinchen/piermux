// 找 dump 中含指定文字的 chunk,印跳脫後的原始 bytes 前後文
import fs from "node:fs";
const [, , dumpPath, needle, ctx = "120"] = process.argv;
const d = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
const C = Number(ctx);
const esc = (s) =>
  [...s]
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c === 0x1b) return "\\e";
      if (c === 0x0d) return "\\r";
      if (c === 0x0a) return "\\n";
      if (c < 0x20) return "\\x" + c.toString(16).padStart(2, "0");
      if (c === 0xfe0f) return "{FE0F}";
      if (c === 0xfe0e) return "{FE0E}";
      if (c === 0x26a0) return "{26A0}";
      return ch;
    })
    .join("");
let found = 0;
d.chunks.forEach((c, i) => {
  if (!c.d) return;
  let idx = 0;
  while ((idx = c.d.indexOf(needle, idx)) !== -1 && found < 8) {
    found++;
    console.log(`--- chunk ${i} at ${idx} ---`);
    console.log(esc(c.d.slice(Math.max(0, idx - C), idx + needle.length + 40)));
    idx += needle.length;
  }
});
console.log("occurrences:", found);
