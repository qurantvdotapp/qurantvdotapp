import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// Shared web app for Tizen TV (.wgt) + Vidaa OS (hosted PWA).
// - base "./" so the bundle works from file:// (packaged wgt) and any hosted origin
// - target es2019: Tizen 5.5+/6.x webviews are Chromium ~79-92; avoid newer syntax
// - assets copied from the Android app (quran-uthmani.txt, Amiri font) — see scripts/copy-assets.sh
export default defineConfig({
  plugins: [solid()],
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: "es2019",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
