# Android 實機驗證 runbook

> 開發機(Linux)沒 Android runtime,Android 行為一律 owner 在實機驗(專案既定分工:
> agent 實作 + 引擎級驗 → owner 實機 smoke-test)。這份是逐項 adb / 肉眼 checklist。
>
> 前提:裝好 debug/release APK、手機開 USB debug、`adb devices` 看得到。

---

## 通用:輸入相關改動(piermux 核心賣點)

### A. 軟鍵盤是否被某動作收掉(focus 是否被搶)
```bash
# 1. 進 attach、點終端叫出鍵盤
adb shell dumpsys input_method | grep -iE "mInputShown|mImeWindowVis"   # 應 mInputShown=true
# 2. 做那個「不該收鍵盤」的動作(按快速鍵 / modifier bar / Send …)
# 3. 再跑一次,mInputShown 應「仍為 true」
adb shell dumpsys input_method | grep -iE "mInputShown"
```
原理:按鈕搶走持有鍵盤元素的焦點 → Android 收鍵盤。修法是在 bar 容器層
`onMouseDown.preventDefault` 不讓焦點被搶。

### B. IME 是否逐鍵輸入(NO_SUGGESTIONS 旗標)
```bash
# 點進該輸入框(focus 後)再跑:
adb shell dumpsys input_method | grep -i inputType
# inputType 含 0x80000 位元 = TYPE_TEXT_FLAG_NO_SUGGESTIONS = 524288
#   → IME 該關掉 composing region、逐鍵提交
```
肉眼:打 `ls` 之類,字母**逐個即時**出現、**沒有底線 composing**、不用按空白/選字才送。
注意:模擬器是 AOSP 鍵盤、不是 Gboard,只有實機 Gboard 能驗真實「選字」手感。

---

## D-25(2026-06-18)— Android 輸入手感兩修

對應 commit `edfd4b0`。引擎級(real Blink = WebView 同引擎)已驗 9/9 PASS;
以下是實機收尾(Gboard 只有實機能驗):

| # | 檢查 | 方法 | 預期 |
|---|---|---|---|
| 1 | 按**快速鍵 / modifier bar** 鍵盤不收 | 通用 A | `mInputShown` 維持 true |
| 2 | CTRL/ALT sticky 可用(連帶受益) | 點 CTRL 後打一個字母 | 送出 Ctrl+letter、鍵盤沒收 |
| 3 | **attach 打字逐鍵即時** | 通用 B + 打 `ls` | inputType 含 `0x80000`、字母逐個即時、無 composing |
| 4 | **capture Send 框仍可組中文** | capture 模式輸入框打注音 | 可正常組字(這框**刻意保留** composition) |

任一不過 → 回報,把 `dumpsys` 輸出貼上來。

---

*建立:2026-06-18(D-25)。新增 Android 行為時在上方「通用」追加可重用檢查,別讓它過期。*
