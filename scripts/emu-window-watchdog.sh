#!/usr/bin/env bash
# Keep the Android TV emulator window at a fixed windowed 50% scale, fully on
# screen (480,360 x 1920x1080 on a 2880x1800 desktop). KWin window rules are
# not applied reliably in this Wayland session, so a lightweight watchdog
# re-asserts the geometry whenever the window maps or moves.
#
# Usage: emu-window-watchdog.sh [start|stop]
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
WIN="$HERE/emu-window"
TARGET_X=480
TARGET_Y=360
TARGET_W=1920
TARGET_H=1080
PIDFILE="${XDG_RUNTIME_DIR:-/tmp}/emu-window-watchdog.pid"
LOG="${XDG_RUNTIME_DIR:-/tmp}/emu-window-watchdog.log"

start() {
  if [ ! -x "$WIN" ] && command -v gcc >/dev/null && [ -f "$HERE/emu-window.c" ]; then
    gcc "$HERE/emu-window.c" -o "$WIN" -lX11 && echo "built $WIN from emu-window.c"
  fi
  if [ ! -x "$WIN" ]; then
    echo "missing $WIN (compile emu-window.c with -lX11, or build via scripts/)"
    return 1
  fi
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "watchdog already running (pid $(cat "$PIDFILE"))"; return 0
  fi
  nohup bash -c '
    WIN="'"$WIN"'"
    while true; do
      geo=$(DISPLAY=:0 "$WIN" "Android Emulator" 2>/dev/null) || { sleep 3; continue; }
      x=$(printf "%s" "$geo" | sed -n "s/.* at \([0-9-]*\),[0-9-]* size [0-9]*x[0-9]*.*/\1/p")
      y=$(printf "%s" "$geo" | sed -n "s/.* at [0-9-]*,\([0-9-]*\) size [0-9]*x[0-9]*.*/\1/p")
      w=$(printf "%s" "$geo" | sed -n "s/.* size \([0-9]*\)x[0-9]*.*/\1/p")
      h=$(printf "%s" "$geo" | sed -n "s/.* size [0-9]*x\([0-9]*\).*/\1/p")
      if [ -n "$w" ] && [ "$w" -gt 500 ] \
         && { [ "$x" != "'"$TARGET_X"'" ] || [ "$y" != "'"$TARGET_Y"'" ] || [ "$w" != "'"$TARGET_W"'" ] || [ "$h" != "'"$TARGET_H"'" ]; }; then
        DISPLAY=:0 "$WIN" "Android Emulator" "'"$TARGET_X"'" "'"$TARGET_Y"'" "'"$TARGET_W"'" "'"$TARGET_H"'"
      fi
      sleep 3
    done
  ' >>"$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  echo "watchdog started (pid $(cat "$PIDFILE"))"
}

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null && echo "watchdog stopped"
    rm -f "$PIDFILE"
  else
    echo "no watchdog"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 [start|stop]"; exit 1 ;;
esac
