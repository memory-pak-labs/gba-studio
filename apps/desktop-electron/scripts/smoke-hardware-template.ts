#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseGBAProjectFile, serializeGBAProjectFile } from "../src/shared/projectFile.js";
import { prepareEngineProjectExport } from "../src/main/exportEngineProject.js";
import { writeEngineSchemaExport } from "../src/main/engineProjectExport.js";
import { writeProjectMemoryReport } from "../src/main/projectMemoryReport.js";
import { validateHardwareSoakEvidence } from "../src/shared/hardwareSoakEvidence.js";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const execFileAsync = promisify(execFile);

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const enginePackRoot = resolveEnginePackRoot(appRoot);
const assetcPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");
const gbsbuildPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "gbsbuild.exe" : "gbsbuild");
const smokeMgbaPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "smoke_mgba.bat" : "smoke_mgba");
const templateRoot = path.join(appRoot, "default-assets", "templates", "exemplo-gba");
const evidenceRoot = path.join(appRoot, "artifacts", "template-hardware-soak", "latest");
const reportPath = path.join(evidenceRoot, "mgba_smoke_report.md");
const evidencePath = path.join(evidenceRoot, "template_hardware_smoke_evidence.json");
const memoryReportPath = path.join(evidenceRoot, "template_memory_report.json");
const emulatorSoakEvidencePath = path.join(evidenceRoot, "mgba_integrated_soak_evidence.json");
const hardwareSoakRequestPath = path.join(evidenceRoot, "hardware_soak_request.json");
const hardwareSoakEvidencePath = path.join(evidenceRoot, "hardware_soak_evidence.json");
const runStress = process.argv.includes("--stress");
const openMgba = process.argv.includes("--open-mgba");
const requestedSoakMinutes = Number(
  process.argv.find((argument) => argument.startsWith("--soak-minutes="))?.slice("--soak-minutes=".length) ?? 0
);
const minimumHardwareMinutes = Number(
  process.argv.find((argument) => argument.startsWith("--minimum-hardware-minutes="))?.slice("--minimum-hardware-minutes=".length) ?? 20
);
const suppliedHardwareEvidencePath = process.argv
  .find((argument) => argument.startsWith("--hardware-evidence="))
  ?.slice("--hardware-evidence=".length);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      cwd: options.cwd ?? appRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (error) {
        const message = error instanceof Error && "code" in error ? `${command} ${args.join(" ")} -> ${error.message}` : String(error);
        reject(new Error(message));
      } else {
        resolve();
      }
    });
  });
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function assertToolExists(toolPath, name) {
  if (!existsSync(toolPath)) {
    throw new Error(`${name} nao encontrado no Engine Pack: ${toolPath}`);
  }
}

async function main() {
  assertToolExists(assetcPath, "assetc");
  assertToolExists(gbsbuildPath, "gbsbuild");
  assertToolExists(smokeMgbaPath, "smoke_mgba");

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "gba-studio-template-hw-soak-"));
  const projectPath = path.join(temporaryRoot, "exemplo-gba.gba-project");
  const exportRoot = path.join(temporaryRoot, "export");
  const buildRoot = path.join(exportRoot, "build");

  try {
    await cp(templateRoot, temporaryRoot, { recursive: true });
    const projectText = await readFile(projectPath, "utf8");
    const parsed = parseGBAProjectFile(projectText);
    const data = parsed.data;
    const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
    const buildSettings = (settings.build && typeof settings.build === "object")
      ? settings.build
      : {};
    buildSettings.enginePackPath = enginePackRoot;
    buildSettings.persistentBuildCache = true;
    settings.build = buildSettings;
    data.settings = settings;
    await writeFile(projectPath, serializeGBAProjectFile(parsed), "utf8");

    const startedAt = Date.now();
    const prepared = prepareEngineProjectExport(data, { enginePackPath: enginePackRoot });
    if (!prepared.generated) {
      throw new Error(prepared.error ?? "Export da ROM do projeto falhou.");
    }

    const exported = await writeEngineSchemaExport({
      destination: exportRoot,
      prepared: prepared.generated,
      assetcPath,
      projectPath,
      cacheEnabled: true
    });
    const exportMs = Date.now() - startedAt;
    if (exported.error) throw new Error(exported.error);
    const romPath = path.join(buildRoot, `${prepared.generated.target}.gba`);
    await execFileAsync(gbsbuildPath, [
      "--engine-pack", enginePackRoot,
      "--project-dir", exportRoot,
      "--build-dir", buildRoot,
      "--devkitpro", process.env.DEVKITPRO ?? "/opt/devkitpro",
      "--devkitarm", process.env.DEVKITARM ?? "/opt/devkitpro/devkitARM"
    ], { timeout: 240_000, maxBuffer: 10 * 1024 * 1024 });
    if (!existsSync(romPath)) {
      throw new Error(`ROM nao encontrada apos build do template: ${romPath}`);
    }

    await mkdir(evidenceRoot, { recursive: true });
    const persistentRomPath = path.join(evidenceRoot, "exemplo-gba.gba");
    const persistentMapPath = path.join(evidenceRoot, "exemplo-gba.map");
    await cp(romPath, persistentRomPath, { force: true });
    const temporaryMapPath = romPath.replace(/\.gba$/i, ".map");
    if (existsSync(temporaryMapPath)) {
      await cp(temporaryMapPath, persistentMapPath, { force: true });
    }
    const romSha256 = await hashFile(persistentRomPath);
    const memory = await writeProjectMemoryReport({
      assetReportPath: path.join(exportRoot, "asset_pack_report.json"),
      outputPath: memoryReportPath,
      romPath
    });

    const smokeArgs = openMgba ? [persistentRomPath] : ["--check-only"];
    if (runStress) smokeArgs.push("--stress");
    if (!openMgba) smokeArgs.push(persistentRomPath);
    const smokeStart = Date.now();
    await run(smokeMgbaPath, smokeArgs, {
      cwd: repoRoot,
      env: { REPORT_PATH: reportPath }
    });
    const smokeMs = Date.now() - smokeStart;
    let emulatorSoak: Record<string, unknown> | null = null;
    if (Number.isFinite(requestedSoakMinutes) && requestedSoakMinutes > 0) {
      const soakStart = Date.now();
      await run(process.execPath, [
        path.join(appRoot, "scripts", "smoke-electron-exemplo-scenes.mjs"),
        `--soak-minutes=${requestedSoakMinutes}`,
        `--evidence=${emulatorSoakEvidencePath}`
      ], { cwd: appRoot });
      emulatorSoak = {
        durationMs: Date.now() - soakStart,
        evidencePath: emulatorSoakEvidencePath,
        minutes: requestedSoakMinutes,
        status: "passed"
      };
    }

    let hardwareSoak: Record<string, unknown>;
    if (suppliedHardwareEvidencePath) {
      const hardwareEvidence = JSON.parse(
        await readFile(path.resolve(suppliedHardwareEvidencePath), "utf8")
      ) as unknown;
      const validation = validateHardwareSoakEvidence(hardwareEvidence, {
        expectedRomSha256: romSha256,
        minimumDurationMinutes: Number.isFinite(minimumHardwareMinutes)
          ? minimumHardwareMinutes
          : 20
      });
      if (!validation.ok) {
        throw new Error(`Evidencia de hardware invalida: ${validation.issues.join("; ")}`);
      }
      await writeFile(hardwareSoakEvidencePath, `${JSON.stringify(hardwareEvidence, null, 2)}\n`, "utf8");
      hardwareSoak = {
        evidencePath: hardwareSoakEvidencePath,
        sourcePath: path.resolve(suppliedHardwareEvidencePath),
        status: "passed"
      };
    } else {
      const request = {
        schema: 1,
        status: "pending",
        evidenceType: "hardware_real",
        expectedRomSha256: romSha256,
        minimumDurationMinutes: Number.isFinite(minimumHardwareMinutes)
          ? minimumHardwareMinutes
          : 20,
        requiredChecks: [
          "boot",
          "sceneTransitions",
          "graphicsAndParallax",
          "audio",
          "input",
          "saves",
          "dmaAndScanlines",
          "oamStress",
          "linkCable"
        ],
        instructions: "Execute a ROM persistida em hardware físico e informe --hardware-evidence=<arquivo.json>."
      };
      await writeFile(hardwareSoakRequestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
      hardwareSoak = {
        requestPath: hardwareSoakRequestPath,
        status: "pending"
      };
    }
    const generated = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      target: "exemplo-gba",
      enginePackRoot,
      templateRoot,
      temporaryRoot,
      exported: {
        destination: exportRoot,
        cacheHit: exported.cache?.hit === true,
        rebuildPlan: exported.cache?.rebuildPlan ?? null
      },
      romPath: persistentRomPath,
      romSha256,
      timings: {
        exportMs,
        smokeMs
      },
      memory: {
        reportPath: memory.path,
        romPercent: memory.report.rom.percent,
        ewramPercent: memory.report.ram.ewram.percent,
        iwramPercent: memory.report.ram.iwram.percent,
        warnings: memory.report.warnings
      },
      soak: {
        emulator: emulatorSoak,
        hardware: hardwareSoak
      },
      artifactPaths: {
        emulatorSoakEvidencePath: emulatorSoak ? emulatorSoakEvidencePath : null,
        reportPath,
        evidencePath,
        hardwareSoakEvidencePath: suppliedHardwareEvidencePath ? hardwareSoakEvidencePath : null,
        hardwareSoakRequestPath: suppliedHardwareEvidencePath ? null : hardwareSoakRequestPath,
        memoryReportPath,
        romPath: persistentRomPath
      },
      mode: {
        openMgba,
        stress: runStress,
        checkOnly: !openMgba,
        soakMinutes: requestedSoakMinutes
      }
    };
    await writeFile(evidencePath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
    console.log(`Hardware + template smoke OK: ${evidencePath}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
