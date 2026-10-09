import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function enginePackPathFromRepo(repoPath) {
  return path.join(repoPath, "dist", "GBAStudioEnginePack");
}

function repoLooksLikeEngine(repoPath) {
  return existsSync(path.join(repoPath, "enginepack.json"));
}

function embeddedEngineRepoFromWorkspace(workspaceRoot) {
  const embedded = path.join(workspaceRoot, "packages", "GBAStudioEngine");
  return repoLooksLikeEngine(embedded) ? embedded : null;
}

function siblingEngineRepoFromWorkspace(workspaceRoot) {
  const sibling = path.join(path.dirname(workspaceRoot), "GBAStudioEngine");
  return repoLooksLikeEngine(sibling) ? sibling : null;
}

export function resolveEnginePackRoot(appRoot = process.cwd()) {
  const envPack = process.env.GBA_STUDIO_ENGINE_PACK_DIR ?? process.env.GBA_STUDIO_ENGINE_PACK_SOURCE;
  if (envPack) return envPack;

  const envRepo = process.env.GBA_STUDIO_ENGINE_REPO;
  if (envRepo) return enginePackPathFromRepo(envRepo);

  const workspaceRoot = path.resolve(appRoot, "..", "..");
  const embeddedRepo = embeddedEngineRepoFromWorkspace(workspaceRoot);
  if (embeddedRepo) return enginePackPathFromRepo(embeddedRepo);

  const siblingRepo = siblingEngineRepoFromWorkspace(workspaceRoot);
  if (siblingRepo) return enginePackPathFromRepo(siblingRepo);

  const homeEngine = path.join(os.homedir(), "Developer", "GBA Studio", "packages", "GBAStudioEngine");
  if (repoLooksLikeEngine(homeEngine)) return enginePackPathFromRepo(homeEngine);

  return enginePackPathFromRepo(path.join(os.homedir(), "Developer", "GBAStudioEngine"));
}
