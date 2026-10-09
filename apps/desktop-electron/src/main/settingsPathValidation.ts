import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  SettingsPathValidationItem,
  SettingsPathValidationKind,
  SettingsPathValidationTarget,
  ValidateSettingsPathsResult
} from "../shared/ipc.js";

function kindForStats(stats: Awaited<ReturnType<typeof stat>>): SettingsPathValidationKind {
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return "other";
}

function executableCandidates(tool: string): string[] {
  return process.platform === "win32" ? [tool, `${tool}.exe`, `${tool}.cmd`, `${tool}.bat`] : [tool];
}

async function pathKind(targetPath: string): Promise<SettingsPathValidationKind> {
  try {
    return kindForStats(await stat(targetPath));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return "missing";
    }
    throw error;
  }
}

async function hasTool(enginePackPath: string, tool: string): Promise<boolean> {
  const candidates = executableCandidates(tool).map((candidate) => join(enginePackPath, "tools", candidate));
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return (await pathKind(candidate)) === "file";
      } catch {
        return false;
      }
    })
  );
  return results.some(Boolean);
}

async function missingTools(target: SettingsPathValidationTarget): Promise<string[]> {
  if (!target.expectedTools?.length) return [];

  const checks = await Promise.all(
    target.expectedTools.map(async (tool) => ({
      tool,
      exists: await hasTool(target.path, tool)
    }))
  );
  return checks.filter((check) => !check.exists).map((check) => check.tool);
}

async function missingFiles(target: SettingsPathValidationTarget): Promise<string[]> {
  if (!target.expectedFiles?.length) return [];

  const checks = await Promise.all(
    target.expectedFiles.map(async (relativePath) => ({
      relativePath,
      exists: (await pathKind(join(target.path, relativePath))) === "file"
    }))
  );
  return checks.filter((check) => !check.exists).map((check) => check.relativePath);
}

async function canCreateDirectory(targetPath: string): Promise<boolean> {
  let parent = dirname(resolve(targetPath));
  while (true) {
    const kind = await pathKind(parent);
    if (kind !== "missing") {
      if (kind !== "directory") return false;
      try {
        await access(parent, constants.W_OK | constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }
    const next = dirname(parent);
    if (next === parent) return false;
    parent = next;
  }
}

async function validateTarget(target: SettingsPathValidationTarget): Promise<SettingsPathValidationItem> {
  try {
    const validationPath = target.validationPath?.trim() || target.path;
    const validationTarget = validationPath === target.path ? target : { ...target, path: validationPath };
    const kind = await pathKind(validationPath);
    const creatable = kind === "missing" && target.mode === "directory" && target.allowCreate === true
      && !target.expectedTools?.length && !target.expectedFiles?.length
      && await canCreateDirectory(validationPath);
    const missing = kind === target.mode ? await missingTools(validationTarget) : [];
    const missingExpectedFiles = kind === target.mode ? await missingFiles(validationTarget) : [];

    return {
      id: target.id,
      label: target.label,
      path: target.path,
      ...(validationPath !== target.path ? { resolvedPath: validationPath } : {}),
      mode: target.mode,
      kind,
      exists: kind !== "missing",
      ...(creatable ? { creatable: true } : {}),
      ok: creatable || (kind === target.mode && missing.length === 0 && missingExpectedFiles.length === 0),
      missingTools: missing,
      missingFiles: missingExpectedFiles
    };
  } catch (error) {
    return {
      id: target.id,
      label: target.label,
      path: target.path,
      mode: target.mode,
      kind: "other",
      exists: false,
      ok: false,
      missingTools: [],
      missingFiles: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function validateSettingsPathTargets(targets: SettingsPathValidationTarget[]): Promise<ValidateSettingsPathsResult> {
  const items = await Promise.all(targets.map(validateTarget));
  return {
    ok: items.every((item) => item.ok),
    items
  };
}
