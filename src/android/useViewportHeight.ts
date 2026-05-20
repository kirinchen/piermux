import { useEffect, useState } from "react";

/**
 * 回傳「沒被 Android 軟鍵盤蓋住」的可視高度(px)。
 *
 * Android WebView 上 100dvh / 100vh 跟軟鍵盤的互動不可靠 —— 鍵盤彈出時常常
 * 不縮,底部輸入框就被鍵盤蓋掉。`window.visualViewport.height` 才永遠等於
 * 真正的可視區域。搭配 manifest 的 `windowSoftInputMode=adjustResize`
 * (視窗本身會縮),把這個高度套到畫面 root,底部輸入框就會一直浮在鍵盤
 * 上方 —— 等同 JuiceSSH 那種「預留 footer」效果。
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setHeight(vv?.height ?? window.innerHeight);
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return height;
}
