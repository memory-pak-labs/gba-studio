import { resolve } from "node:path";
import type { OpenProjectResult } from "../shared/ipc.js";
import { openProjectFile } from "./projectPersistence.js";

export interface ResolveLaunchProjectPathOptions {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

function normalizeLaunchPath(value: string | undefined, cwd: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return resolve(cwd, trimmed);
}

function launchProjectArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith("--open-project=")) {
      return argument.slice("--open-project=".length);
    }
    if (argument === "--open-project") {
      return argv[index + 1];
    }
  }
  return undefined;
}

function standaloneProjectArg(argv: string[]): string | undefined {
  return argv.find((argument) => {
    const value = argument.trim().toLowerCase();
    return !value.startsWith("-") && (
      value.endsWith(".gba-project") ||
      value.endsWith(".gbastudio") ||
      value.endsWith(".gbsproj")
    );
  });
}

export function resolveLaunchProjectPath(options: ResolveLaunchProjectPathOptions): string | null {
  return (
    normalizeLaunchPath(options.env.GBA_STUDIO_OPEN_PROJECT, options.cwd) ??
    normalizeLaunchPath(launchProjectArg(options.argv), options.cwd) ??
    normalizeLaunchPath(standaloneProjectArg(options.argv), options.cwd)
  );
}

export function resolveCurrentLaunchProjectPath(env: NodeJS.ProcessEnv = process.env): string | null {
  return resolveLaunchProjectPath({
    argv: process.argv,
    cwd: process.cwd(),
    env
  });
}

export async function resolveLaunchProject(
  options: ResolveLaunchProjectPathOptions = {
    argv: process.argv,
    cwd: process.cwd(),
    env: process.env
  }
): Promise<OpenProjectResult> {
  const projectPath = resolveLaunchProjectPath(options);
  if (projectPath) {
    return loadLaunchProject(projectPath);
  }
  return { canceled: true };
}

export async function loadLaunchProject(projectPath: string | null): Promise<OpenProjectResult> {
  if (!projectPath) {
    return { canceled: true };
  }

  return openProjectFile(projectPath);
}
