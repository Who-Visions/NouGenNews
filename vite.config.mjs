import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// CesiumJS (the Weather tab's 3D globe) is a prebuilt bundle with its own workers and assets. It is copied next to the
// app and loaded from the same origin, so the page's security policy never has to allow a remote script.
const cesiumFiles = () => ({
  name: "nougennews-cesium",
  closeBundle() {
    const from = resolve("node_modules/cesium/Build/Cesium");
    if (existsSync(from)) cpSync(from, resolve("dist/cesium"), { recursive: true });
  },
});

// The Electron renderer. Relative base so the built files load from file://.
export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react(), cesiumFiles()],
  build: { outDir: "../dist", emptyOutDir: true },
});
