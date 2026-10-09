import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolveEmulatorLaunchPlan } from "../shared/emulatorLaunch.js";

const execFileAsync = promisify(execFile);

export interface LaunchRomInEmulatorOptions {
  romPath: string;
  emulatorPath?: string;
}

export interface LaunchRomInEmulatorResult {
  ok: boolean;
  error?: string;
  launchMethod?: string;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveSpawnExecutable(spawnExecutable: string): Promise<string | null> {
  if (await pathExists(spawnExecutable)) {
    return spawnExecutable;
  }

  try {
    const whichCommand = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(whichCommand, [spawnExecutable], { timeout: 5_000 });
    const resolved = stdout.trim().split(/\r?\n/).find(Boolean);
    return resolved && await pathExists(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export async function launchRomInEmulator(options: LaunchRomInEmulatorOptions): Promise<LaunchRomInEmulatorResult> {
  const romPath = options.romPath.trim();
  if (!romPath) {
    return { ok: false, error: "ROM invalida para abrir no emulador." };
  }
  if (!(await pathExists(romPath))) {
    return { ok: false, error: `ROM nao encontrada: ${romPath}` };
  }

  const plan = resolveEmulatorLaunchPlan({
    emulatorPath: options.emulatorPath ?? "",
    romPath
  });

  if (plan.kind === "macos-open-app") {
    if (!(await pathExists(plan.emulatorPath))) {
      return {
        ok: false,
        error: `Emulador nao encontrado: ${plan.emulatorPath}. Instale mGBA ou configure emulatorPath em Ajustes > Preview.`
      };
    }

    try {
      await execFileAsync("open", ["-a", plan.emulatorPath, plan.romPath], { timeout: 10_000 });
      return { ok: true, launchMethod: "macos-open-app" };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const spawnExecutable = plan.spawnExecutable ?? plan.emulatorPath;
  const resolvedExecutable = await resolveSpawnExecutable(spawnExecutable);
  if (!resolvedExecutable) {
    return {
      ok: false,
      error: `Emulador nao encontrado (${spawnExecutable}). Configure emulatorPath em Ajustes > Preview.`
    };
  }

  try {
    const child = spawn(resolvedExecutable, [plan.romPath], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return { ok: true, launchMethod: "spawn" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
