import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Electron renderer. Relative base so the built files load from file://.
export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
});
