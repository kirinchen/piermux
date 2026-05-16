#!/usr/bin/env bash
# Build signed release APK + (optional) install to connected device.
#
# 用途:出能離線跑的 release APK(把前端 bundle 進去,不靠 PC vite dev server)。
# 適合 git bash on Windows / macOS / Linux。
#
# 用法:
#   bash scripts/build-android-release.sh              # build only
#   bash scripts/build-android-release.sh --install    # build + uninstall old + install new
#   bash scripts/build-android-release.sh --install-only  # 跳過 build,只裝最新的 APK
#
# 前置:
#   1. key.properties 已填好(看 src-tauri/gen/android/app/key.properties.example)
#   2. .cargo/config.toml NDK linker 路徑已改成你的(看 .cargo/config.toml.example)
#   3. rustup target add aarch64-linux-android armv7-linux-androideabi
#   4. --install 模式需手機接 USB + USB debugging on

set -euo pipefail

# 找 repo root(script 從哪呼叫都能用)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_ID="dev.kirinchen.piermux"
KEY_PROPS="$REPO_ROOT/src-tauri/gen/android/app/key.properties"

MODE="build"
case "${1:-}" in
    --install)       MODE="build+install" ;;
    --install-only)  MODE="install-only" ;;
    --help|-h)
        sed -n '2,17p' "$0"
        exit 0
        ;;
    "") ;;
    *)
        echo "[piermux] 不認識的參數: $1。bash $0 --help" >&2
        exit 2
        ;;
esac

cd "$REPO_ROOT"

# ---- precheck ----
if [[ "$MODE" != "install-only" ]]; then
    if [[ ! -f "$KEY_PROPS" ]]; then
        echo "[piermux] 缺 $KEY_PROPS" >&2
        echo "          cp src-tauri/gen/android/app/key.properties.example src-tauri/gen/android/app/key.properties" >&2
        echo "          然後填好 4 個欄位(看 .example 註解)" >&2
        exit 1
    fi
fi

if [[ "$MODE" != "build" ]]; then
    if ! command -v adb >/dev/null; then
        echo "[piermux] PATH 上找不到 adb。Android SDK platform-tools 加進 PATH 再試" >&2
        exit 1
    fi
fi

# ---- build ----
if [[ "$MODE" != "install-only" ]]; then
    echo "[piermux] 開始 build release APK(預期 1-3 分鐘,看是否要重編 Rust)"
    npm run tauri android build -- --apk
    echo "[piermux] build 完成"
fi

# ---- locate APK ----
# Tauri 2 預設出 split-per-arch APK + universal。優先 universal(裝哪都能跑),
# 沒有的話挑 arm64-v8a(2026 主流機型)。
APK_DIR="$REPO_ROOT/src-tauri/gen/android/app/build/outputs/apk"
APK=""
for candidate in \
    "$APK_DIR/universal/release/app-universal-release.apk" \
    "$APK_DIR/arm64/release/app-arm64-release.apk" \
    "$APK_DIR/arm64-v8a/release/app-arm64-v8a-release.apk"
do
    if [[ -f "$candidate" ]]; then
        APK="$candidate"
        break
    fi
done

if [[ -z "$APK" ]]; then
    echo "[piermux] 找不到 release APK,看一下 $APK_DIR 底下有什麼" >&2
    find "$APK_DIR" -name '*.apk' -type f 2>/dev/null || true
    exit 1
fi

APK_SIZE=$(du -h "$APK" | cut -f1)
echo "[piermux] APK: $APK ($APK_SIZE)"

if [[ "$MODE" == "build" ]]; then
    echo ""
    echo "[piermux] 自己裝的話:"
    echo "  adb install -r '$APK'"
    echo "  或拷到手機點開"
    exit 0
fi

# ---- install ----
DEVICE_COUNT=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')
if [[ "$DEVICE_COUNT" -eq 0 ]]; then
    echo "[piermux] 沒偵測到 adb device(state=device)" >&2
    echo "          確認手機 USB debugging 開 + 跳出來的「允許 USB 偵錯」按確認" >&2
    adb devices
    exit 1
fi
echo "[piermux] adb device(s): $DEVICE_COUNT"

# Dev / release 簽章不同,直接 install 會撞 INSTALL_FAILED_UPDATE_INCOMPATIBLE。
# 先嘗試 uninstall(沒裝過會回非 0,但無妨),再裝。
echo "[piermux] uninstall 舊版(忽略「沒裝過」錯誤)"
adb uninstall "$APP_ID" || true

echo "[piermux] install $APK"
adb install -r "$APK"

echo "[piermux] 完成 — 手機上點 piermux 圖示就開,不需要 PC dev server"
