import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildPilotDefinition,
  materializePilotProjects,
  type PilotCase
} from "./pilot.js";

const execFileAsync = promisify(execFile);

interface RunPilotOptions {
  repositoryRoot: string;
  destination: string;
  enginePackPath: string;
}

interface PreparationReport {
  profile: {
    name: string;
    frame_width: number;
    frame_height: number;
    current_exporter_compatible: boolean;
  };
  frame_count: number;
  output_width: number;
  output_height: number;
  visible_colors: number;
  animation_bytes_4bpp: number;
  hardware_objects_per_frame: number;
  current_runtime_objects_per_frame: number;
  warnings: string[];
}

interface WorkflowEvidence {
  enginePack: { version: string; doctorOk: boolean };
  export: { target: string; generatedFiles: number; warnings: string[] };
  sprite: {
    actorId: string;
    spriteSheet: string;
    animationName: string;
    frameCount: number;
    exportedAsset: string;
    runtimeAnimationMode: "named" | "sheet-default";
  };
  build: { romPath: string; romBytes: number; romSha256: string };
  smoke: { checkOnly: boolean; reportPath: string };
}

export interface PilotCaseResult {
  id: PilotCase["id"];
  label: string;
  passed: true;
  source: PilotCase["source"] & { inputSha256: string };
  preparation: PreparationReport;
  workflow: WorkflowEvidence;
  paths: {
    root: string;
    preparedPng: string;
    previewPng: string;
    project: string;
    rom: string;
  };
}

export interface PilotSummary {
  schema: 1;
  passed: true;
  casesPassed: number;
  casesTotal: number;
  enginePackPath: string;
  cases: PilotCaseResult[];
}

function stem(fileName: string): string {
  return fileName.replace(/\.png$/i, "");
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function pipelineArgs(
  pilotCase: PilotCase,
  projectPath: string,
  outputRoot: string,
  enginePackPath: string
): string[] {
  const args = [
    pilotCase.inputPath,
    outputRoot,
    "--project", projectPath,
    "--actor", pilotCase.actorId,
    "--sprite-name", pilotCase.spriteName,
    "--engine-pack", enginePackPath,
    "--profile", pilotCase.profile,
    "--frames", "1",
    "--animation-name", pilotCase.animationName,
    "--state", pilotCase.state,
    "--direction", pilotCase.direction,
    "--fps", "8",
    "--no-snap"
  ];
  if (pilotCase.profile === "free") {
    args.push(
      "--width", String(pilotCase.frameWidth),
      "--height", String(pilotCase.frameHeight)
    );
  }
  return args;
}

function markdown(summary: PilotSummary): string {
  const rows = summary.cases.map((entry) => (
    `| ${entry.label} | ${entry.preparation.profile.name} | `
    + `${entry.preparation.output_width}x${entry.preparation.output_height} | `
    + `${entry.preparation.visible_colors} | ${entry.workflow.build.romBytes} | `
    + `${entry.workflow.build.romSha256.slice(0, 12)} | OK |`
  ));
  return [
    "# Piloto de assets reais",
    "",
    `Resultado: **${summary.casesPassed}/${summary.casesTotal} casos aprovados**.`,
    "",
    "| Caso | Perfil | PNG final | Cores | ROM (bytes) | SHA-256 | Status |",
    "| --- | --- | ---: | ---: | ---: | --- | --- |",
    ...rows,
    "",
    "Cada caso passou por preparação, importação em cópia autocontida, export do Engine Pack,",
    "gbsdoctor, gbsbuild e smoke check-only do mGBA.",
    ""
  ].join("\n");
}

export async function runPilot(options: RunPilotOptions): Promise<PilotSummary> {
  const destination = path.resolve(options.destination);
  const enginePackPath = path.resolve(options.enginePackPath);
  const pipeline = path.join(options.repositoryRoot, "tools/gba-sprite-prep/gba-sprite-pipeline");
  if (!existsSync(path.join(enginePackPath, "tools/assetc"))) {
    throw new Error(`Engine Pack sem assetc: ${enginePackPath}`);
  }
  await mkdir(destination, { recursive: false });
  const baseRoot = path.join(destination, "base-projects");
  const projects = await materializePilotProjects({
    repositoryRoot: options.repositoryRoot,
    destination: baseRoot
  });
  const projectByCase = new Map(projects.map((entry) => [entry.caseId, entry]));
  const definition = buildPilotDefinition(options.repositoryRoot);
  const results: PilotCaseResult[] = [];

  for (const pilotCase of definition.cases) {
    const project = projectByCase.get(pilotCase.id);
    if (!project) throw new Error(`Projeto-base ausente para ${pilotCase.id}.`);
    const outputRoot = path.join(destination, "cases", pilotCase.id);
    await execFileAsync(
      pipeline,
      pipelineArgs(pilotCase, project.projectPath, outputRoot, enginePackPath),
      {
        cwd: options.repositoryRoot,
        encoding: "utf8",
        timeout: 180_000,
        maxBuffer: 32 * 1024 * 1024
      }
    );

    const preparedStem = stem(pilotCase.spriteName);
    const preparedPng = path.join(outputRoot, "prepared", pilotCase.spriteName);
    const reportPath = path.join(outputRoot, "prepared", `${preparedStem}.report.json`);
    const previewPng = path.join(outputRoot, "prepared", `${preparedStem}.preview.png`);
    const projectCopy = path.join(outputRoot, "project", path.basename(project.projectPath));
    const evidencePath = path.join(outputRoot, "engine-export", "sprite_pipeline_evidence.json");
    const preparation = JSON.parse(await readFile(reportPath, "utf8")) as PreparationReport;
    const workflow = JSON.parse(await readFile(evidencePath, "utf8")) as WorkflowEvidence;
    const preparedInfo = await stat(preparedPng);
    if (!preparedInfo.isFile() || preparedInfo.size === 0) {
      throw new Error(`PNG preparado inválido para ${pilotCase.id}.`);
    }
    results.push({
      id: pilotCase.id,
      label: pilotCase.label,
      passed: true,
      source: { ...pilotCase.source, inputSha256: await sha256(pilotCase.inputPath) },
      preparation,
      workflow,
      paths: {
        root: outputRoot,
        preparedPng,
        previewPng,
        project: projectCopy,
        rom: workflow.build.romPath
      }
    });
  }

  const summary: PilotSummary = {
    schema: 1,
    passed: true,
    casesPassed: results.length,
    casesTotal: definition.cases.length,
    enginePackPath,
    cases: results
  };
  await writeFile(
    path.join(destination, "pilot-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(destination, "pilot-summary.md"), markdown(summary), "utf8");
  return summary;
}
