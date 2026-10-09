import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveEngineToolInvocation } from "./engineToolInvocation.js";

describe("Engine Pack Python tools", () => {
  it.each(["linux", "win32"] as const)("uses only bundled build tools on %s even when external configuration is broken", async (platform) => {
    const resources = await mkdtemp(path.join(tmpdir(), "GBA Studio offline "));
    try {
      const tool = path.join(resources, "EnginePack/GBAStudioEnginePack/tools/gbsbuild.py");
      const python = path.join(resources, platform === "win32" ? "Runtime/Python/python.exe" : "Runtime/Python/bin/python3");
      const suffix = platform === "win32" ? ".exe" : "";
      for (const file of [tool, python, `Toolchain/bin/make${suffix}`, `Toolchain/bin/bash${suffix}`, `Toolchain/devkitARM/bin/arm-none-eabi-g++${suffix}`, `Toolchain/tools/bin/gbafix${suffix}`]) {
        const absolute = path.isAbsolute(file) ? file : path.join(resources, file);
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, "fixture");
      }
      await writeFile(path.join(resources, "Runtime/runtime.json"), JSON.stringify({ profile: "offline", platform, arch: "x64" }));
      const invocation = resolveEngineToolInvocation(tool, ["--json"], { platform, env: {
        PATH: "/external/tools", GBA_STUDIO_PYTHON: "/missing/python", DEVKITPRO: "/missing/compiler", PYTHONHOME: "/wrong/python"
      } });
      expect(invocation.executable).toBe(python);
      expect(invocation.args).toEqual(["-I", "-X", "utf8", tool, "--json"]);
      expect(invocation.env?.DEVKITPRO).toBe(path.join(resources, "Toolchain"));
      expect(invocation.env?.MAKE).toBe(path.join(resources, `Toolchain/bin/make${suffix}`));
      expect(invocation.env?.GBS_SHELL).toBe(path.join(resources, `Toolchain/bin/bash${suffix}`).replaceAll("\\", "/"));
      expect(invocation.env?.PATH).not.toContain("/external/tools");
      expect(invocation.env?.PYTHONHOME).toBeUndefined();
    } finally { await rm(resources, { recursive: true, force: true }); }
  });

  it("fails visibly when an offline package is incomplete instead of falling back to external Python", async () => {
    const resources = await mkdtemp(path.join(tmpdir(), "gba-offline-broken-"));
    try {
      await mkdir(path.join(resources, "Runtime"));
      await writeFile(path.join(resources, "Runtime/runtime.json"), JSON.stringify({ profile: "offline", platform: "linux", arch: "x64" }));
      expect(() => resolveEngineToolInvocation(path.join(resources, "EnginePack/GBAStudioEnginePack/tools/assetc.py"), [], { platform: "linux" })).toThrow(/embutido/);
    } finally { await rm(resources, { recursive: true, force: true }); }
  });
  it("executes a Python tool with spaces, Unicode and shell characters unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "GBA Studio Python "));
    try {
      const tool = path.join(root, "tool.py");
      await writeFile(tool, "import json,sys\nprint(json.dumps(sys.argv[1:]))\n");
      const args = ["Meu jogo & teste", "ação", "literal$(whoami)"];
      const invocation = resolveEngineToolInvocation(tool, args);
      const { stdout } = await promisify(execFile)(invocation.executable, invocation.args);
      expect(JSON.parse(stdout)).toEqual(args);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("passes paths and arguments literally to Python on Windows", () => {
    const tool = "C:\\Program Files\\GBA Studio\\resources\\assetc.py";
    const args = ["--project-dir", "C:\\Jogos\\Meu jogo & teste", "ação"];
    expect(resolveEngineToolInvocation(tool, args, { platform: "win32", env: {} })).toEqual({
      executable: "python", args: ["-X", "utf8", tool, ...args]
    });
  });

  it("honors an explicitly configured Python executable on Linux", () => {
    expect(resolveEngineToolInvocation("/opt/GBA Studio/tools/gbsbuild.py", ["--json"], {
      platform: "linux", env: { GBA_STUDIO_PYTHON: "/opt/Python 3/bin/python3" }
    })).toEqual({ executable: "/opt/Python 3/bin/python3", args: ["-X", "utf8", "/opt/GBA Studio/tools/gbsbuild.py", "--json"] });
  });

  it("keeps native and macOS wrapper invocations unchanged", () => {
    expect(resolveEngineToolInvocation("/Applications/GBA Studio.app/tools/gbsbuild", ["--json"], {
      platform: "darwin", env: {}
    })).toEqual({ executable: "/Applications/GBA Studio.app/tools/gbsbuild", args: ["--json"] });
  });

  it("quotes batch tool paths and project arguments containing spaces", () => {
    const invocation = resolveEngineToolInvocation("C:\\GBA Studio\\tools\\gbsbuild.cmd", ["--project-dir", "C:\\Meu jogo"], {
      platform: "win32", env: {}
    });
    expect(invocation.executable).toBe("cmd.exe");
    expect(invocation.args).toEqual(["/d", "/s", "/c", '""C:\\GBA Studio\\tools\\gbsbuild.cmd" "--project-dir" "C:\\Meu jogo""']);
    expect(invocation.windowsVerbatimArguments).toBe(true);
  });
});
