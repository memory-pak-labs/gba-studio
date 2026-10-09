import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    testTimeout: 30_000,
    environmentMatchGlobs: [
      ["src/renderer/**/*.test.tsx", "happy-dom"]
    ],
    setupFiles: ["./src/renderer/test/setup.ts"]
  }
});
