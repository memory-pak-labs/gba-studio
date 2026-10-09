#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "test", "--", "src/main/materializeFunctionalP0Fixture.test.ts"], {
  cwd: appRoot,
  env: {
    ...process.env,
    GBA_STUDIO_MATERIALIZE_P0_FIXTURE: "1"
  },
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[materialize:technical-fixture] fixture técnica pronta em ${path.join(appRoot, "fixtures", "electron-p0-playtest.gba-project")}`);
console.log("[materialize:technical-fixture] abra com: npm run dev:technical-fixture");
