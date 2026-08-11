import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Shared web app for Tizen TV (.wgt) + Vidaa OS (hosted PWA).
// - base "./" so the bundle works from file:// (packaged wgt) and any hosted origin
// - target es2019: Tizen 5.5+/6.x webviews are Chromium ~79-92; avoid newer syntax
// - assets copied from the Android app (quran-uthmani.txt, Amiri font) — see scripts/copy-assets.sh
export default defineConfig({
  plugins: [solid()],
  base: "./",
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
