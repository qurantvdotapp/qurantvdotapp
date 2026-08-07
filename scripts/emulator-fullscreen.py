#!/usr/bin/env python3
"""Toggle the Android Emulator window to fullscreen (XFCE/EWMH).

Uses the standard _NET_WM_STATE_FULLSCREEN client message so any EWMH window
manager (xfwm4, etc.) honors it. Needs a running X server with the emulator
window visible (DISPLAY defaults to :0).

Usage:
    python3 scripts/emulator-fullscreen.py          # fullscreen the emulator
    python3 scripts/emulator-fullscreen.py --toggle # toggle in/out of fullscreen
"""
import sys
import time

from Xlib import X, display
from Xlib.protocol import event

DISPLAY_NAME = ":0"


def find_emulator_windows(d):
    root = d.screen().root
    found = []

    def walk(win):
        try:
            wm_name = win.get_wm_name() or ""
            net_name = win.get_full_property(d.intern_atom("_NET_WM_NAME"), 0)
            if net_name:
                wm_name += " " + str(net_name.value)
        except Exception:
            wm_name = ""
        if "emulator" in wm_name.lower():
            found.append(win)
        try:
            for child in win.query_tree().children:
                walk(child)
        except Exception:
            pass

    walk(root)
    return found


def main():
    toggle = "--toggle" in sys.argv
    d = display.Display(DISPLAY_NAME)
    windows = find_emulator_windows(d)
    if not windows:
        d.close()
        print("ERROR: no emulator window found on", DISPLAY_NAME, file=sys.stderr)
        sys.exit(1)
    win = windows[0]
    atom_state = d.intern_atom("_NET_WM_STATE")
    atom_fullscreen = d.intern_atom("_NET_WM_STATE_FULLSCREEN")

    prop = win.get_full_property(atom_state, 0)
    is_fs = bool(prop and atom_fullscreen in prop.value)
    want = not is_fs if toggle else True

    root = d.screen().root
    action = 1 if want else 0  # _NET_WM_STATE_ADD / _NET_WM_STATE_REMOVE
    ev = event.ClientMessage(
        window=win,
        client_type=atom_state,
        data=(32, [action, atom_fullscreen, 0, 0, 0]),
    )
    # Send to both root and the window itself — some WMs (xfwm4) only honor the
    # direct-to-window variant.
    for target in (root, win):
        target.send_event(ev, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
        d.flush()
        time.sleep(0.3)
    d.sync()
    d.close()
    print(f"{'Entered' if want else 'Left'} fullscreen for emulator window {win.id}")


if __name__ == "__main__":
    main()
