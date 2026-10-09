#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(appRoot, "artifacts", "author-stress-rom", "latest");
const enginePackRoot = resolveEnginePackRoot(appRoot);
const smokeMgbaPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "smoke_mgba.bat" : "smoke_mgba");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: appRoot, env: { ...process.env, ...(options.env ?? {}) }, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} saiu com codigo ${code ?? "desconhecido"}.`)));
  });
}

async function main() {
  if (!existsSync(smokeMgbaPath)) throw new Error(`smoke_mgba nao encontrado: ${smokeMgbaPath}`);
  await mkdir(evidenceRoot, { recursive: true });
  await run(process.platform === "win32" ? "npm.cmd" : "npm", ["test", "--", "--run", "src/main/authorStressRom.test.ts"], {
    env: { GBA_STUDIO_AUTHOR_STRESS_EVIDENCE_DIR: evidenceRoot }
  });
  const evidencePath = path.join(evidenceRoot, "author_stress_export_evidence.json");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const reportPath = path.join(evidenceRoot, "mgba_smoke_report.md");
  await run(smokeMgbaPath, ["--check-only", evidence.romPath], { env: { REPORT_PATH: reportPath } });
  await writeFile(evidencePath, `${JSON.stringify({ ...evidence, mgbaCheckOnlyPassed: true, mgbaReportPath: reportPath }, null, 2)}\n`, "utf8");
  console.log(`Stress autoral OK: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
