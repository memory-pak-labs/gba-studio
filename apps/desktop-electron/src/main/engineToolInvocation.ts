import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface EngineToolInvocationOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function resolveEngineToolInvocation(
  toolPath: string,
  args: string[],
  options: EngineToolInvocationOptions = {}
): { executable: string; args: string[]; env?: NodeJS.ProcessEnv; windowsVerbatimArguments?: boolean } {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (/\.py$/i.test(toolPath)) {
    const resources = path.resolve(path.dirname(toolPath), "../../..");
    const marker = path.join(resources, "Runtime/runtime.json");
    if (platform !== "darwin" && existsSync(marker)) {
      const runtime = JSON.parse(readFileSync(marker, "utf8"));
      if (runtime.profile !== "offline" || runtime.platform !== platform || runtime.arch !== "x64") {
        throw new Error("Manifesto do runtime embutido incompatível.");
      }
      const toolchain = path.join(resources, "Toolchain");
      const suffix = platform === "win32" ? ".exe" : "";
      const pythonRoot = path.join(resources, "Runtime/Python");
      const python = path.join(pythonRoot, platform === "win32" ? "python.exe" : "bin/python3");
      const make = path.join(toolchain, `bin/make${suffix}`);
      const shell = path.join(toolchain, `bin/bash${suffix}`);
      for (const file of [python, make, shell, path.join(toolchain, `devkitARM/bin/arm-none-eabi-g++${suffix}`), path.join(toolchain, `tools/bin/gbafix${suffix}`)]) {
        if (!existsSync(file)) throw new Error(`Recurso embutido ausente: ${file}`);
      }
      const bundledEnv = { ...env };
      for (const key of ["PYTHONHOME", "PYTHONPATH", "VIRTUAL_ENV", "MAKEFLAGS", "MFLAGS", "CPATH", "CPLUS_INCLUDE_PATH", "C_INCLUDE_PATH"]) delete bundledEnv[key];
      // Windows variable names are case insensitive; do not pass both Path and PATH.
      for (const key of Object.keys(bundledEnv)) if (key.toLowerCase() === "path") delete bundledEnv[key];
      bundledEnv.PATH = [path.join(toolchain, "bin"), path.join(toolchain, "devkitARM/bin"), path.join(toolchain, "tools/bin"), pythonRoot, path.join(pythonRoot, "bin")].join(platform === "win32" ? ";" : ":");
      bundledEnv.GBA_STUDIO_PYTHON = python;
      bundledEnv.DEVKITPRO = toolchain;
      bundledEnv.DEVKITARM = path.join(toolchain, "devkitARM");
      bundledEnv.MAKE = make;
      bundledEnv.GBS_SHELL = shell.replaceAll("\\", "/");
      if (platform === "linux") bundledEnv.LD_LIBRARY_PATH = path.join(toolchain, "lib-host");
      return { executable: python, args: ["-I", "-X", "utf8", toolPath, ...args], env: bundledEnv };
    }
    return {
      executable: env.GBA_STUDIO_PYTHON?.trim() || (platform === "win32" ? "python" : "python3"),
      args: ["-X", "utf8", toolPath, ...args]
    };
  }
  if (platform === "win32" && /\.(cmd|bat)$/i.test(toolPath)) {
    const command = [toolPath, ...args].map((value) => `"${value.replaceAll('"', '""')}"`).join(" ");
    return {
      executable: env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `"${command}"`],
      windowsVerbatimArguments: true
    };
  }
  return { executable: toolPath, args };
}
