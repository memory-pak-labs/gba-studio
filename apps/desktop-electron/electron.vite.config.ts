import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const translationRuntimeDir = fileURLToPath(new URL("./.cache/translation-runtime", import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: {
          main: resolve(__dirname, "src/main/main.ts"),
          mcp: resolve(__dirname, "src/mcp/mcp.ts")
        }
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/preload"
    }
  },
  renderer: {
    plugins: [react()],
    publicDir: translationRuntimeDir,
    build: {
      outDir: "dist/renderer"
    }
  }
});
