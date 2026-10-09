#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEngineP0RomSmokeEvidence } from "./engine-p0-rom-smoke-evidence.mjs";
import {
  verifyNativeVisualExportContract,
  verifyNativeVisualRuntimeMain,
  verifyTopdownWalk4DirsExportContract
} from "./lib/native-visual-rom-contracts.mjs";
import { assertP0SourceExists } from "./p0-source-catalog.mjs";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const technicalP0Source = assertP0SourceExists(appRoot, "technicalFixture");
const enginePackRoot = resolveEnginePackRoot(appRoot);
const assetcPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");
const configuredEvidenceRoot = process.env.GBA_STUDIO_ENGINE_P0_ROM_SMOKE_DIR
  ?? path.join(appRoot, "artifacts", "engine-rom-p0", "latest");
const evidenceRoot = path.isAbsolute(configuredEvidenceRoot)
  ? configuredEvidenceRoot
  : path.resolve(appRoot, configuredEvidenceRoot);
const exportRoot = path.join(evidenceRoot, "export");
const exportDir = path.join(exportRoot, "exported-p0");
const romPath = path.join(exportDir, "build", "electron_p0_functional.gba");
const runtimeMainPath = path.join(exportDir, "main.cpp");
const exportContractPath = path.join(exportDir, "export_project.json");
const reportPath = path.join(evidenceRoot, "mgba_smoke_report.md");
const evidencePath = path.join(evidenceRoot, "engine_p0_rom_smoke_evidence.json");
const manualChecklistPath = path.join(evidenceRoot, "manual_mgba_playtest.md");
const smokeMgbaPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "smoke_mgba.bat" : "smoke_mgba");
const openMgba = process.argv.includes("--open-mgba");
const nativeExportTestName = "exports the Electron technical P0 fixture through assetc into a buildable native topdown ROM";

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
  if (technicalP0Source.role !== "technical-contract-fixture"
    || technicalP0Source.excludedFromCanonicalAcceptance !== true) {
    throw new Error(`O smoke de ROM reduzido precisa usar uma fixture técnica explícita: ${JSON.stringify(technicalP0Source)}`);
  }
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
      GBA_STUDIO_ENGINE_P0_EXPORT_EVIDENCE_DIR: exportRoot
    }
  });

  if (!existsSync(romPath)) {
    throw new Error(`ROM da fixture técnica P0 esperada nao foi gerada: ${romPath}`);
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
  const walk4DirsSummary = verifyTopdownWalk4DirsExportContract(exportContract);
  const projectHeader = await readFile(path.join(exportDir, "gbastudio_project_data.hpp"), "utf8");
  if (!projectHeader.includes("player_walk_down_animation") || !projectHeader.includes("player_animations[")) {
    throw new Error("Header P0 sem player_walk_down_animation / player_animations — walk 4 dirs nao chegou ao assetc.");
  }
  const animationCountMatch = projectHeader.match(/player_animations,\s*\n\s*(\d+)/);
  const animationCount = animationCountMatch ? Number(animationCountMatch[1]) : 0;
  if (animationCount < 6) {
    throw new Error(`Header P0 com animation_count=${animationCount}; precisa >= 6 para walk 4 dirs.`);
  }
  Object.assign(nativeVisualExportSummary, { walk4Dirs: walk4DirsSummary, playerAnimationCount: animationCount });

  await writeFile(manualChecklistPath, [
    "# Playtest manual mGBA - fixture técnica P0",
    "",
    `- Fonte: ${technicalP0Source.id} (${technicalP0Source.role})`,
    "",
    `- ROM: ${romPath}`,
    `- Relatorio mGBA: ${reportPath}`,
    `- Modo: ${openMgba ? "manual-open" : "check-only"}`,
    "",
    "## Criterios",
    "",
    "- [ ] Boot sem tela branca, tela preta permanente ou travamento.",
    "- [ ] Tilemap real da room inicial visivel (tileset importado, nao tiles coloridos de debug).",
    "- [ ] Player / ator renderizado como sprite OBJ real (`player_topdown_4dir.png`), nao marcador quadrado de witness.",
    "- [ ] Ao mover o player, a animacao troca idle→walk nas 4 direcoes (down/up/left/right; left via flip).",
    "- [ ] Room inicial contem trigger e colisao conforme a fixture técnica P0.",
    "- [ ] Interacao inicial mostra o dialogo `intro_001`.",
    "- [ ] Caixa de dialogo legivel, com contraste suficiente sobre a cena.",
    "- [ ] Trigger de porta troca para `room_2` com tilemap da segunda room.",
    "- [ ] A janela do mGBA permanece responsiva por pelo menos 10 segundos.",
    "",
    "## Resultado",
    "",
    "- [ ] aprovado",
    "- [ ] reprovado",
    "",
    "Depois de testar, marque todos os criterios, deixe somente `aprovado` marcado e rode:",
    "",
    "```sh",
    "npm run verify:technical-p0:rom",
    "```",
    "",
    "Notas:",
    ""
  ].join("\n"), "utf8");

  const evidence = buildEngineP0RomSmokeEvidence({
    checkedAt: new Date().toISOString(),
    enginePackRoot,
    exportRoot,
    romPath,
    romSha256: await sha256(romPath),
    runtimeMainPath,
    nativeVisualRuntimeFeatures,
    nativeVisualExportSummary,
    source: {
      id: technicalP0Source.id,
      role: technicalP0Source.role,
      projectPath: technicalP0Source.projectPath,
      acceptanceSurfaces: technicalP0Source.acceptanceSurfaces,
      excludedFromCanonicalAcceptance: technicalP0Source.excludedFromCanonicalAcceptance
    },
    mgbaReportPath: reportPath,
    manualChecklistPath,
    openMgba
  });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Technical P0 ROM smoke OK: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
