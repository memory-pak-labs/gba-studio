import { join } from "node:path";
import type { GBAProjectData } from "../shared/projectFile.js";
import { readProjectEnginePackPath, resolveRomExportRoot } from "../shared/engineRomPipeline.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { inspectEnginePack, readEnginePackVersion, runSelectedEnginePackBuild, runSelectedEnginePackDoctor } from "./enginePack.js";
import { writeProjectMemoryReport } from "./projectMemoryReport.js";
import { writeRomOccupancyArtifact } from "./romOccupancyArtifact.js";
import { projectPersistentBuildCacheEnabled } from "./engineBuildCache.js";

export interface BuildProjectRomArtifactOptions {
  data: GBAProjectData;
  projectPath: string;
  enginePackPath?: string;
}

export interface BuildProjectRomArtifactResult {
  romPath: string | null;
  memoryReportPath?: string | null;
  romOccupancyPath?: string | null;
  error?: string;
}

export async function buildProjectRomArtifact(
  options: BuildProjectRomArtifactOptions
): Promise<BuildProjectRomArtifactResult> {
  const preferredEnginePackPath = options.enginePackPath || readProjectEnginePackPath(options.data);
  const enginePackStatus = inspectEnginePack({ preferredPath: preferredEnginePackPath });
  const selectedEnginePack = enginePackStatus.selected;
  if (!selectedEnginePack?.assetcPath || !selectedEnginePack.hasAssetc) {
    return { romPath: null, error: "GBAStudio Engine Pack com assetc nao localizado." };
  }
  if (!selectedEnginePack.gbsbuildPath || !selectedEnginePack.hasGbsbuild) {
    return { romPath: null, error: "GBAStudio Engine Pack com gbsbuild nao localizado." };
  }

  const prepared = prepareEngineProjectExport(options.data, {
    enginePackPath: selectedEnginePack.path,
    enginePackVersion: await readEnginePackVersion(selectedEnginePack.path) ?? undefined
  });
  if (!prepared.generated) {
    return { romPath: null, error: prepared.error ?? "Falha ao preparar exportacao Engine Pack." };
  }

  const destination = join(resolveRomExportRoot(options.projectPath, options.data), prepared.generated.target);
  await writeEngineSchemaExport({
    destination,
    prepared: prepared.generated,
    assetcPath: selectedEnginePack.assetcPath,
    projectPath: options.projectPath,
    cacheEnabled: projectPersistentBuildCacheEnabled(options.data)
  });

  const doctor = await runSelectedEnginePackDoctor({
    projectDir: destination,
    enginePackPath: preferredEnginePackPath
  });
  if (doctor.error || (doctor.exitCode !== null && doctor.exitCode !== 0)) {
    return {
      romPath: null,
      error: doctor.error ?? `gbsdoctor falhou com codigo ${doctor.exitCode ?? "desconhecido"}.`
    };
  }

  const build = await runSelectedEnginePackBuild(destination, preferredEnginePackPath);
  if (build.error || !build.summary?.romPath) {
    return { romPath: null, error: build.error ?? "gbsbuild nao retornou caminho da ROM." };
  }

  const occupancy = await writeRomOccupancyArtifact(build.summary.romPath);
  const memory = await writeProjectMemoryReport({
    assetReportPath: join(destination, "asset_pack_report.json"),
    romPath: build.summary.romPath
  }).catch((error) => {
    console.warn("[webRomPipeline] writeProjectMemoryReport failed:", error);
    return null;
  });
  return {
    romPath: build.summary.romPath,
    memoryReportPath: memory?.path ?? null,
    romOccupancyPath: occupancy?.path ?? null
  };
}
