import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { availableParallelism } from "node:os";

export default defineConfig({
  plugins: [react()],
  test: {
    // Cap concurrent large fixtures to limit host memory pressure.
    maxWorkers: Math.min(4, availableParallelism()),
    environment: "node",
    testTimeout: 30_000,
    environmentMatchGlobs: [
      ["src/renderer/**/*.test.tsx", "happy-dom"]
    ],
    setupFiles: ["./src/renderer/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...configDefaults.exclude, "src/shared/projectOpenPerf.test.ts"],
          sequence: { groupOrder: 0 }
        }
      },
      {
        extends: true,
        test: {
          name: "project-open-perf",
          include: ["src/shared/projectOpenPerf.test.ts"],
          pool: "threads",
          maxWorkers: 1,
          fileParallelism: false,
          // Use a separate worker pool after the functional suite releases its work.
          sequence: { groupOrder: 1 }
        }
      }
    ]
  }
});
