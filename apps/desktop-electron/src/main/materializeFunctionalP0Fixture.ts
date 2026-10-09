import { access, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildFunctionalP0Project } from "../shared/functionalP0Project.js";
import { copyCurrentTechnicalAsset } from "./currentTechnicalAssets.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";

const fixtureAssetRelativePaths = [
  "Assets/tiles/tiles_topdown_sandbox.png",
  "Assets/tiles/tiles_overworld.png",
  "Assets/maps/topdown_sandbox_stage1.tmx",
  "Assets/sprites/player_topdown_4dir.png",
  "Assets/sprites/actor_point_click.png",
  "Assets/sprites/cursor_point_click.png",
  "Assets/portraits/portrait.png",
  "Assets/ui/dialogue_box.png",
  "Assets/ui/dialogue_selector.png",
  "Assets/fonts/gba-dialogue-font-v3.png",
  "Assets/fonts/gba-variable-font.png",
  "Assets/audio/intro_theme.mod",
  "Assets/audio/confirm.wav"
] as const;

export interface MaterializeFunctionalP0FixtureOptions {
  appRoot: string;
  projectFileName?: string;
  enginePackPath?: string;
  emulatorPath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function child(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function configureFunctionalP0ProjectForLocalPlay(
  project: GBAProjectData,
  options: { enginePackPath: string; emulatorPath: string }
): GBAProjectData {
  const settings = isRecord(project.settings) ? project.settings : {};
  const build = child(settings, "build");
  const preview = child(settings, "preview");

  return {
    ...project,
    name: "Electron Technical P0 Fixture",
    settings: {
      ...settings,
      general: {
        ...child(settings, "general"),
        gameTitle: "Electron Technical P0 Fixture"
      },
      build: {
        ...build,
        enginePackPath: options.enginePackPath,
        runEmulatorAfterBuild: false
      },
      preview: {
        ...preview,
        emulator: "mgba",
        emulatorPath: options.emulatorPath,
        runAfterBuild: false
      }
    }
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureCurrentTechnicalAssets(projectRoot: string, appRoot: string): Promise<void> {
  await Promise.all(fixtureAssetRelativePaths.map(async (relativePath) => {
    const destinationPath = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    if (!(await pathExists(destinationPath))) {
      await copyCurrentTechnicalAsset({
        appRoot,
        relativePath: relativePath.replace(/^Assets\//, ""),
        destinationPath
      });
    }
  }));
}

export async function materializeFunctionalP0Fixture(
  options: MaterializeFunctionalP0FixtureOptions
): Promise<{ projectPath: string; projectRoot: string; enginePackPath: string; emulatorPath: string }> {
  const projectRoot = path.join(options.appRoot, "fixtures");
  const projectPath = path.join(projectRoot, options.projectFileName ?? "electron-p0-playtest.gba-project");
  const localEnginePackPath = path.resolve(options.appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
  const configuredEnginePackPath = options.enginePackPath
    ?? process.env.GBA_STUDIO_ENGINE_PACK_DIR
    ?? process.env.GBA_STUDIO_ENGINE_PACK_SOURCE;
  const enginePackPath = configuredEnginePackPath
    ?? (await pathExists(localEnginePackPath) ? localEnginePackPath : path.join(os.homedir(), "Developer", "GBAStudioEngine", "dist", "GBAStudioEnginePack"));
  const emulatorPath = options.emulatorPath
    ?? process.env.GBA_STUDIO_MGBA_APP
    ?? (process.platform === "darwin" ? "/Applications/mGBA.app" : "");

  await ensureCurrentTechnicalAssets(projectRoot, options.appRoot);

  const project = configureFunctionalP0ProjectForLocalPlay(buildFunctionalP0Project(), {
    enginePackPath,
    emulatorPath
  });
  const serialized = serializeGBAProjectFile({
    data: project,
    summary: summarizeGBAProject(project)
  });
  await writeFile(projectPath, serialized, "utf8");

  return { projectPath, projectRoot, enginePackPath, emulatorPath };
}
