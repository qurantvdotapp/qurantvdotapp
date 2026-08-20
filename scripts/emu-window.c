// Print and optionally move/resize a window by title substring.
// Usage: ./xwin <title-substr> [x y w h]
#include <X11/Xlib.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

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
    if (argc < 2) { fprintf(stderr, "usage: %s <title-substr> [x y w h]\n", argv[0]); return 1; }
    Display *d = XOpenDisplay(NULL);
    if (!d) { fprintf(stderr, "no display\n"); return 1; }
    Window win = find_window(d, DefaultRootWindow(d), argv[1], 0);
    if (!win) { fprintf(stderr, "window not found\n"); return 1; }
    XWindowAttributes a;
    XGetWindowAttributes(d, win, &a);
    printf("window 0x%lx at %d,%d size %dx%d\n", win, a.x, a.y, a.width, a.height);
    if (argc == 6) {
        int x = atoi(argv[2]), y = atoi(argv[3]), w = atoi(argv[4]), h = atoi(argv[5]);
        XMoveResizeWindow(d, win, x, y, w, h);
        XFlush(d);
        printf("moved/resized to %d,%d %dx%d\n", x, y, w, h);
    }
    XCloseDisplay(d);
    return 0;
}
