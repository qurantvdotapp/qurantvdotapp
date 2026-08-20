// Minimal X11 helper: find a window by title substring, focus it, send a key combo.
// Usage: ./xkeys <window-title-substring> <keysym1> [keysym2 ...]
// e.g. ./xkeys "Android Emulator" Control_L 0
#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <X11/extensions/XTest.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

static Window find_window(Display *d, Window w, const char *needle, int depth) {
    if (depth > 6) return 0;
    char *name = NULL;
    if (XFetchName(d, w, &name) && name) {
        if (strstr(name, needle)) { XFree(name); return w; }
        XFree(name);
    }
    Window root, parent, *children = NULL;
    unsigned int n = 0;
    if (XQueryTree(d, w, &root, &parent, &children, &n)) {
        for (unsigned int i = 0; i < n; i++) {
            Window hit = find_window(d, children[i], needle, depth + 1);
            if (hit) { if (children) XFree(children); return hit; }
        }
        if (children) XFree(children);
    }
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: %s <title-substr> <keysym> [...]\n", argv[0]); return 1; }
    Display *d = XOpenDisplay(NULL);
    if (!d) { fprintf(stderr, "cannot open display\n"); return 1; }
    Window win = find_window(d, DefaultRootWindow(d), argv[1], 0);
    if (!win) { fprintf(stderr, "window not found: %s\n", argv[1]); return 1; }
    XRaiseWindow(d, win);
    XSetInputFocus(d, win, RevertToParent, CurrentTime);
    XFlush(d);
    usleep(200000);

    KeyCode mods[4]; int nmods = 0;
    KeyCode keys[4]; int nkeys = 0;
    for (int i = 2; i < argc; i++) {
        KeySym sym = XStringToKeysym(argv[i]);
        if (sym == NoSymbol) { fprintf(stderr, "bad keysym %s\n", argv[i]); return 1; }
        if (strstr(argv[i], "Control") || strstr(argv[i], "Shift") || strstr(argv[i], "Alt") || strstr(argv[i], "Super"))
            mods[nmods++] = XKeysymToKeycode(d, sym);
        else
            keys[nkeys++] = XKeysymToKeycode(d, sym);
    }
    for (int i = 0; i < nmods; i++) XTestFakeKeyEvent(d, mods[i], True, 0);
    for (int i = 0; i < nkeys; i++) { XTestFakeKeyEvent(d, keys[i], True, 0); XTestFakeKeyEvent(d, keys[i], False, 0); }
    for (int i = 0; i < nmods; i++) XTestFakeKeyEvent(d, mods[i], False, 0);
    XFlush(d);
    usleep(100000);
    XCloseDisplay(d);
    printf("sent %d keys to 0x%lx\n", nkeys, win);
    return 0;
}
