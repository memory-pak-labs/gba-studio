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
  "rooms-runtime-export",
  "latest",
  "rooms_runtime_export_evidence.json"
);

mkdirSync(path.dirname(evidencePath), { recursive: true });

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "test", "--", "roomsRuntimeExportSmoke"], {
  cwd: appRoot,
  env: {
    ...process.env,
    GBA_STUDIO_ROOMS_RUNTIME_EXPORT_EVIDENCE: evidencePath
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Rooms runtime/export evidence: ${evidencePath}`);
    return;
  }
  process.exitCode = code ?? 1;
});
