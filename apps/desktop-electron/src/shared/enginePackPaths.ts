import { existsSync } from "node:fs";
import path from "node:path";

export const GBA_STUDIO_ENGINE_REPO_URL =
  "https://github.com/matmel0/GBA-Studio/tree/main/packages/GBAStudioEngine";

export function enginePackPathFromRepo(repoPath: string): string {
  return path.join(repoPath, "dist", "GBAStudioEnginePack");
}

export interface EnginePackCandidatePath {
  label: string;
  path: string;
}

export interface ResolveEnginePackCandidatePathsOptions {
  envPackPath?: string;
  envRepoPath?: string;
  appPath?: string;
  homeDir?: string;
  resourcesPath?: string;
}

function repoLooksLikeEngine(repoPath: string): boolean {
  return existsSync(path.join(repoPath, "enginepack.json"));
}

function embeddedEngineRepoFromWorkspace(workspaceRoot: string): string | null {
  const embedded = path.join(workspaceRoot, "packages", "GBAStudioEngine");
  return repoLooksLikeEngine(embedded) ? embedded : null;
}

export function resolveEnginePackCandidatePaths(
  options: ResolveEnginePackCandidatePathsOptions = {}
): EnginePackCandidatePath[] {
  const candidates: EnginePackCandidatePath[] = [];
  const envPackPath = options.envPackPath?.trim();
  if (envPackPath) {
    candidates.push({ label: "Variavel de ambiente (pack)", path: envPackPath });
  }

  const envRepoPath = options.envRepoPath?.trim();
  if (envRepoPath) {
    candidates.push({ label: "Variavel de ambiente (repo)", path: enginePackPathFromRepo(envRepoPath) });
  }

  if (options.appPath) {
    const workspaceRoot = path.resolve(options.appPath, "..", "..");
    const embeddedRepo = embeddedEngineRepoFromWorkspace(workspaceRoot);
    if (embeddedRepo) {
      candidates.push({ label: "Engine no monorepo", path: enginePackPathFromRepo(embeddedRepo) });
    }
  }

  if (options.resourcesPath) {
    candidates.push({
      label: "Recursos do aplicativo",
      path: path.join(options.resourcesPath, "EnginePack", "GBAStudioEnginePack")
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = path.resolve(candidate.path);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function resolveDefaultEnginePackPath(options: ResolveEnginePackCandidatePathsOptions = {}): string {
  const envPackPath = options.envPackPath?.trim();
  if (envPackPath) return envPackPath;

  const envRepoPath = options.envRepoPath?.trim();
  if (envRepoPath) return enginePackPathFromRepo(envRepoPath);

  const firstExisting = resolveEnginePackCandidatePaths(options).find((candidate) => existsSync(candidate.path));
  if (firstExisting) return firstExisting.path;

  if (options.appPath) {
    const embeddedRepo = embeddedEngineRepoFromWorkspace(path.resolve(options.appPath, "..", ".."));
    if (embeddedRepo) return enginePackPathFromRepo(embeddedRepo);
  }

  const homeDir = options.homeDir ?? path.join(process.env.HOME ?? "", "");
  const monorepoEngine = path.join(homeDir, "Developer", "GBA Studio", "packages", "GBAStudioEngine");
  return enginePackPathFromRepo(monorepoEngine);
}
