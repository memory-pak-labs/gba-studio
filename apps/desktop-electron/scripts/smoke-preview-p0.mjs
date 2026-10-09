#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getP0Source } from "./p0-source-catalog.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const technicalP0Source = getP0Source("technicalFixture");
const evidencePath = path.join(
  appRoot,
  "artifacts",
  "preview-playtest",
  "latest",
  "preview_playtest_evidence.json"
);
const engineP0EvidencePath = path.join(
  appRoot,
  "artifacts",
  "engine-rom-p0",
  "latest",
  "engine_p0_rom_smoke_evidence.json"
);

function resolveP0RomSource() {
  const explicit = process.env.GBA_STUDIO_P0_ROM_SOURCE?.trim();
  if (explicit && existsSync(explicit)) return explicit;
  if (!existsSync(engineP0EvidencePath)) return undefined;
  const evidence = JSON.parse(readFileSync(engineP0EvidencePath, "utf8"));
  return evidence?.ok === true && evidence?.romBuildVerified === true && existsSync(evidence.romPath)
    ? evidence.romPath
    : undefined;
}

mkdirSync(path.dirname(evidencePath), { recursive: true });
const p0RomSource = resolveP0RomSource();
const p0ProjectPath = process.env.GBA_STUDIO_P0_PROJECT_PATH?.trim();

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "test", "--", "previewP0Flow"], {
  cwd: appRoot,
  env: {
    ...process.env,
    GBA_STUDIO_PREVIEW_PLAYTEST_EVIDENCE: evidencePath,
    GBA_STUDIO_P0_SOURCE_ID: technicalP0Source.id,
    ...(p0RomSource ? { GBA_STUDIO_PREVIEW_ROM_SOURCE: p0RomSource } : {}),
    ...(p0ProjectPath ? { GBA_STUDIO_P0_PROJECT_PATH: p0ProjectPath } : {})
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

child.on("exit", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }

  console.log(`Preview técnico P0 evidence: ${evidencePath}`);
  const visualChild = spawn(npmCommand, ["run", "smoke:technical-p0:preview:visual"], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit"
  });

  visualChild.on("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

  visualChild.on("exit", (visualCode) => {
    process.exitCode = visualCode ?? 1;
  });
});
