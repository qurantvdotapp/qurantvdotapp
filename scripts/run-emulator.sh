#!/usr/bin/env bash
# Run the Quran TV app on the Android TV emulator WITH audio.
#
# Usage:
#   ./scripts/run-emulator.sh            # default AVD: Television_1080p
#   ./scripts/run-emulator.sh <avd-name>
#
# Notes:
#   - `-audio pulse` routes emulator audio to the host's PulseAudio default
#     sink (e.g. a headset or HDMI). Do NOT pass -no-audio or you will get
#     silence.
#   - The APK is rebuilt and reinstalled if it exists; the app is then started
#     (resuming the last session via the Continue card if present).
#   - Emulator flags: swiftshader GPU (headless-safe), no boot animation.
set -euo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
EMULATOR="$SDK/emulator/emulator"
ADB="$SDK/platform-tools/adb"
AVD_NAME="${1:-Television_1080p}"
APK="$(cd "$(dirname "$0")/.." && pwd)/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.qurantv.app"

if [ ! -x "$EMULATOR" ]; then
  echo "ERROR: emulator not found at $EMULATOR (set ANDROID_HOME)" >&2
  exit 1
fi

echo "==> Launching AVD '$AVD_NAME' with audio (PulseAudio) ..."
nohup "$EMULATOR" -avd "$AVD_NAME" \
  -no-snapshot \
  -no-boot-anim \
  -gpu swiftshader_indirect \
  -audio pulse \
  > /tmp/qurantv-emulator.log 2>&1 &

echo "==> Waiting for boot (this can take a minute or two) ..."
"$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
echo "==> Booted."

if [ -f "$APK" ]; then
  echo "==> Installing $APK ..."
  "$ADB" install -r "$APK"
else
  echo "==> No APK at $APK — build it first with: ./gradlew :app:assembleDebug" >&2
fi

echo "==> Starting $PKG ..."
"$ADB" shell am start -n "$PKG/.MainActivity"

# Best-effort fullscreen for the emulator window (XFCE/EWMH; needs python3-Xlib).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if python3 -c 'import Xlib' 2>/dev/null; then
  python3 "$SCRIPT_DIR/emulator-fullscreen.py" 2>/dev/null \
    || echo "(fullscreen: window not found — toggle manually via the emulator toolbar)"
else
  echo "(fullscreen helper needs python3-Xlib; toggle manually via the emulator toolbar)"
fi

echo
echo "Audio check:"
"$ADB" shell dumpsys audio 2>/dev/null | grep -m1 "AudioPlaybackConfiguration" || true
echo
echo "D-pad keys: 19/20/21/22 = up/down/left/right · 23 = OK · 4 = back"
echo "            85 = play/pause · 165 = INFO (toggle text/page mode)"
