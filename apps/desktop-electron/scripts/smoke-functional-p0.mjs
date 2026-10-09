#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const evidencePath = path.join(
  appRoot,
  "artifacts",
  "functional-playtest",
  "latest",
  "functional_playtest_evidence.json"
);

mkdirSync(path.dirname(evidencePath), { recursive: true });

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "test", "--", "functionalP0Flow"], {
  cwd: appRoot,
  env: {
    ...process.env,
    GBA_STUDIO_FUNCTIONAL_PLAYTEST_EVIDENCE: evidencePath
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Technical P0 evidence: ${evidencePath}`);
    return;
  }
  process.exitCode = code ?? 1;
});
