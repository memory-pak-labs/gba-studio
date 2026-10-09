#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyNativeVisualExportContract,
  verifyNativeVisualRuntimeMain
} from "./lib/native-visual-rom-contracts.mjs";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const enginePackRoot = resolveEnginePackRoot(appRoot);
const assetcPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");
const configuredEvidenceRoot = process.env.GBA_STUDIO_ENGINE_ROM_SMOKE_DIR
  ?? path.join(os.tmpdir(), `gbastudio-electron-engine-rom-${process.pid}`);
const evidenceRoot = path.isAbsolute(configuredEvidenceRoot)
  ? configuredEvidenceRoot
  : path.resolve(appRoot, configuredEvidenceRoot);
const exportRoot = path.join(evidenceRoot, "export");
const exportDir = path.join(exportRoot, "exported-fixture");
const romPath = path.join(exportDir, "build", "electron_topdown_demo.gba");
const runtimeMainPath = path.join(exportDir, "main.cpp");
const exportContractPath = path.join(exportDir, "export_project.json");
const reportPath = path.join(evidenceRoot, "mgba_smoke_report.md");
const evidencePath = path.join(evidenceRoot, "engine_rom_smoke_evidence.json");
const manualChecklistPath = path.join(evidenceRoot, "manual_mgba_playtest.md");
const smokeMgbaPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "smoke_mgba.bat" : "smoke_mgba");
const openMgba = process.argv.includes("--open-mgba");
const nativeExportTestName = "exports the shared fixture through assetc export_project.json into a buildable Engine Pack ROM";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? appRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} saiu com codigo ${code ?? "desconhecido"}.`));
      }
    });
  });
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  if (!existsSync(path.join(enginePackRoot, "tools", process.platform === "win32" ? "gbsbuild.exe" : "gbsbuild"))) {
    throw new Error(`gbsbuild nao encontrado no Engine Pack: ${enginePackRoot}`);
  }
  if (!existsSync(assetcPath)) {
    throw new Error(`assetc nao encontrado no Engine Pack: ${assetcPath}`);
  }
  if (!existsSync(smokeMgbaPath)) {
    throw new Error(`smoke_mgba nao encontrado no Engine Pack: ${smokeMgbaPath}`);
  }

  await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });
  await run("npm", [
    "test",
    "--",
    "--run",
    "src/main/engineProjectExport.test.ts",
    "-t",
    nativeExportTestName
  ], {
    env: {
      GBA_STUDIO_ENGINE_EXPORT_EVIDENCE_DIR: exportRoot
    }
  });

  if (!existsSync(romPath)) {
    throw new Error(`ROM esperada nao foi gerada: ${romPath}`);
  }

  await run(smokeMgbaPath, openMgba ? [romPath] : ["--check-only", romPath], {
    cwd: repoRoot,
    env: {
      REPORT_PATH: reportPath
    }
  });

  const mainCpp = await readFile(runtimeMainPath, "utf8");
  const exportContract = JSON.parse(await readFile(exportContractPath, "utf8"));
  const nativeVisualRuntimeFeatures = verifyNativeVisualRuntimeMain(mainCpp);
  const nativeVisualExportSummary = verifyNativeVisualExportContract(exportContract);

  await writeFile(manualChecklistPath, [
    "# Playtest manual mGBA",
    "",
    `- ROM: ${romPath}`,
    `- Relatorio mGBA: ${reportPath}`,
    `- Modo: ${openMgba ? "manual-open" : "check-only"}`,
    "",
    "## Criterios",
    "",
    "- [ ] Boot sem tela branca, tela preta permanente ou travamento.",
    "- [ ] Tilemap real da fixture topdown-demo visivel (tileset importado).",
    "- [ ] Player renderizado como sprite OBJ real (`player_topdown_4dir.png`).",
    "- [ ] Runtime nativo responde a input e dialogo sem depender de overlay witness.",
    "- [ ] A janela do mGBA permanece responsiva por pelo menos 10 segundos.",
    "",
    "## Resultado",
    "",
    "- [ ] aprovado",
    "- [ ] reprovado",
    "",
    "Notas:",
    ""
  ].join("\n"), "utf8");

  const evidence = {
    ok: true,
    checkedAt: new Date().toISOString(),
    enginePackRoot,
    exportRoot,
    target: "electron_topdown_demo",
    romPath,
    romSha256: await sha256(romPath),
    romBuildVerified: true,
    exportPipeline: "schema-assetc-native",
    nativeVisualRuntimeVerified: true,
    nativeVisualRuntimeFeatures,
    nativeVisualExportSummary,
    runtimeMainPath,
    mgbaReportPath: reportPath,
    mgbaMode: openMgba ? "manual-open" : "check-only",
    mgbaCheckOnlyPassed: !openMgba,
    bootVisualVerified: openMgba,
    manualChecklistPath,
    manualVisualPlaytestPassed: false
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Engine ROM smoke OK: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
