import { chmod, mkdir, mkdtemp, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireBuildLock } from "./stableBuildFiles.js";
import {
  makeGbsbuildDryRunArgs,
  makeGbsbuildArgs,
  makeGbsdoctorArgs,
  runGbsbuild,
  runGbsbuildDryRun,
  runGbsdoctor,
  readEnginePackVersion,
  summarizeBuildDryRunOutput,
  summarizeDoctorOutput,
  type DoctorProcessResult
} from "./enginePack.js";

const temporaryRoots: string[] = [];

async function makeTemporaryDoctor(stdout: string, exitCode = 0): Promise<{ enginePackPath: string; doctorPath: string }> {
  const enginePackPath = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-doctor-"));
  temporaryRoots.push(enginePackPath);
  const toolsPath = path.join(enginePackPath, "tools");
  await mkdir(toolsPath, { recursive: true });
  const doctorPath = path.join(toolsPath, process.platform === "win32" ? "gbsdoctor.cmd" : "gbsdoctor");
  const script =
    process.platform === "win32"
      ? `@echo off\r\necho ${stdout}\r\nexit /b ${exitCode}\r\n`
      : `#!/bin/sh\nprintf '%s\\n' '${stdout.replace(/'/g, "'\\''")}'\nexit ${exitCode}\n`;
  await writeFile(doctorPath, script, "utf8");
  if (process.platform !== "win32") {
    await chmod(doctorPath, 0o755);
  }
  return { enginePackPath, doctorPath };
}

async function makeTemporaryBuild(stdout: string, exitCode = 0): Promise<{ enginePackPath: string; buildPath: string; projectDir: string }> {
  const enginePackPath = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-build-"));
  temporaryRoots.push(enginePackPath);
  const toolsPath = path.join(enginePackPath, "tools");
  const projectDir = path.join(enginePackPath, "project");
  await mkdir(toolsPath, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  const buildPath = path.join(toolsPath, process.platform === "win32" ? "gbsbuild.cmd" : "gbsbuild");
  const script =
    process.platform === "win32"
      ? `@echo off\r\necho ${stdout}\r\nexit /b ${exitCode}\r\n`
      : `#!/bin/sh\nprintf '%s\\n' '${stdout.replace(/'/g, "'\\''")}'\nexit ${exitCode}\n`;
  await writeFile(buildPath, script, "utf8");
  if (process.platform !== "win32") {
    await chmod(buildPath, 0o755);
  }
  return { enginePackPath, buildPath, projectDir };
}

async function makeSpacingSensitiveBuild(): Promise<{ enginePackPath: string; buildPath: string; root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio electron build-"));
  temporaryRoots.push(root);
  const enginePackPath = path.join(root, "EnginePack");
  const toolsPath = path.join(enginePackPath, "tools");
  await mkdir(toolsPath, { recursive: true });
  const buildPath = path.join(toolsPath, process.platform === "win32" ? "gbsbuild.cmd" : "gbsbuild");
  const script =
    process.platform === "win32"
      ? [
          "@echo off",
          'node "%~dp0\\gbsbuild-spaces.js" %*',
          "exit /b %ERRORLEVEL%",
          ""
        ].join("\r\n")
      : [
          "#!/bin/sh",
          "node \"$(dirname \"$0\")/gbsbuild-spaces.js\" \"$@\"",
          ""
        ].join("\n");
  const helper = [
    "const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');",
    "const { join } = require('node:path');",
    "const args = process.argv.slice(2);",
    "const valueAfter = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };",
    "const projectDir = valueAfter('--project-dir');",
    "const buildDir = valueAfter('--build-dir') ?? join(projectDir, 'build');",
    "if (!projectDir || projectDir.includes(' ')) process.exit(64);",
    "const manifest = JSON.parse(readFileSync(join(projectDir, 'gbastudio_project.json'), 'utf8'));",
    "const target = manifest.build.target;",
    "if (args.includes('--dry-run')) {",
    "  process.stdout.write(JSON.stringify({ command: ['make', `PROJECT_DIR=${projectDir}`, `TARGET=${target}`, `BUILD_DIR=${buildDir}`, 'all'] }));",
    "  process.exit(0);",
    "}",
    "mkdirSync(buildDir, { recursive: true });",
    "writeFileSync(join(buildDir, `${target}.gba`), 'rom-bytes');",
    "process.stdout.write('staged-project='+projectDir);",
    ""
  ].join("\n");
  await writeFile(buildPath, script, "utf8");
  await writeFile(path.join(toolsPath, "gbsbuild-spaces.js"), helper, "utf8");
  if (process.platform !== "win32") {
    await chmod(buildPath, 0o755);
  }
  return { enginePackPath, buildPath, root };
}

afterEach(async () => {
  const fs = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("Engine Pack doctor integration", () => {
  it("reads the selected Engine Pack version from enginepack.json", async () => {
    const enginePackPath = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-enginepack-version-"));
    temporaryRoots.push(enginePackPath);
    await writeFile(path.join(enginePackPath, "enginepack.json"), JSON.stringify({ version: "2.24.0" }), "utf8");

    await expect(readEnginePackVersion(enginePackPath)).resolves.toBe("2.24.0");
  });

  it("builds gbsdoctor arguments with an explicit engine pack path", () => {
    expect(makeGbsdoctorArgs({ enginePackPath: "/packs/GBAStudioEnginePack" })).toEqual([
      "--engine-pack",
      "/packs/GBAStudioEnginePack",
      "--json"
    ]);
  });

  it("builds gbsdoctor arguments with an exported project path", () => {
    expect(makeGbsdoctorArgs({ enginePackPath: "/packs/GBAStudioEnginePack", projectDir: "/projects/exported" })).toEqual([
      "--engine-pack",
      "/packs/GBAStudioEnginePack",
      "--project-dir",
      "/projects/exported",
      "--json"
    ]);
  });

  it("summarizes the large gbsdoctor JSON into renderer-safe fields", () => {
    const summary = summarizeDoctorOutput({
      ok: true,
      version: "gbsdoctor 2.24.0",
      engine_pack: "/packs/GBAStudioEnginePack",
      platform: { system: "Darwin", machine: "arm64" },
      engine_manifest: { ok: true, version: "2.24.0" },
      readiness: { blockers: [{ id: "hardware_or_ci_validation", message: "Validar em CI." }] },
      checks: [
        { key: "engine_pack", ok: true },
        { key: "gbsdoctor", ok: true },
        { key: "toolchain", ok: false }
      ]
    });

    expect(summary).toEqual({
      ok: true,
      version: "gbsdoctor 2.24.0",
      enginePackPath: "/packs/GBAStudioEnginePack",
      platform: "Darwin arm64",
      engineVersion: "2.24.0",
      checksPassed: 2,
      checksTotal: 3,
      blockers: [{ id: "hardware_or_ci_validation", message: "Validar em CI." }]
    });
  });

  it("runs gbsdoctor and parses stdout JSON", async () => {
    const payload = JSON.stringify({
      ok: true,
      version: "gbsdoctor test",
      engine_pack: "/fake",
      checks: [{ key: "engine_pack", ok: true }]
    });
    const { enginePackPath, doctorPath } = await makeTemporaryDoctor(payload);

    const result: DoctorProcessResult = await runGbsdoctor({ enginePackPath, gbsdoctorPath: doctorPath });

    expect(result.exitCode).toBe(0);
    expect(result.summary?.ok).toBe(true);
    expect(result.summary?.checksPassed).toBe(1);
    expect(result.summary?.checksTotal).toBe(1);
  });

  it("builds gbsbuild dry-run arguments with explicit paths", () => {
    expect(
      makeGbsbuildDryRunArgs({
        enginePackPath: "/packs/GBAStudioEnginePack",
        projectDir: "/projects/exported",
        buildDir: "/projects/exported/build"
      })
    ).toEqual([
      "--engine-pack",
      "/packs/GBAStudioEnginePack",
      "--project-dir",
      "/projects/exported",
      "--dry-run",
      "--json",
      "--build-dir",
      "/projects/exported/build"
    ]);
  });

  it("builds gbsbuild real build arguments with explicit paths", () => {
    expect(
      makeGbsbuildArgs({
        enginePackPath: "/packs/GBAStudioEnginePack",
        projectDir: "/projects/exported",
        buildDir: "/projects/exported/build"
      })
    ).toEqual([
      "--engine-pack",
      "/packs/GBAStudioEnginePack",
      "--project-dir",
      "/projects/exported",
      "--build-dir",
      "/projects/exported/build"
    ]);
  });

  it("summarizes gbsbuild dry-run JSON into renderer-safe fields", () => {
    const summary = summarizeBuildDryRunOutput({
      command: [
        "make",
        "-f",
        "/packs/GBAStudioEnginePack/templates/Makefile.gba",
        "PROJECT_DIR=/projects/exported",
        "ENGINE_PACK=/packs/GBAStudioEnginePack",
        "TARGET=demo_game",
        "BUILD_DIR=/projects/exported/build",
        "all"
      ]
    });

    expect(summary).toEqual({
      command: [
        "make",
        "-f",
        "/packs/GBAStudioEnginePack/templates/Makefile.gba",
        "PROJECT_DIR=/projects/exported",
        "ENGINE_PACK=/packs/GBAStudioEnginePack",
        "TARGET=demo_game",
        "BUILD_DIR=/projects/exported/build",
        "all"
      ],
      target: "demo_game",
      projectDir: "/projects/exported",
      buildDir: "/projects/exported/build"
    });
  });

  it("runs gbsbuild dry-run and parses stdout JSON", async () => {
    const payload = JSON.stringify({
      command: ["make", "-f", "/pack/templates/Makefile.gba", "PROJECT_DIR=/tmp/project", "TARGET=demo", "BUILD_DIR=/tmp/project/build", "all"]
    });
    const { enginePackPath, buildPath, projectDir } = await makeTemporaryBuild(payload);

    const result = await runGbsbuildDryRun({ enginePackPath, gbsbuildPath: buildPath, projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.summary?.target).toBe("demo");
    expect(result.summary?.projectDir).toBe("/tmp/project");
    expect(result.summary?.buildDir).toBe("/tmp/project/build");
  });

  it("runs gbsbuild real build and returns the expected ROM path", async () => {
    const { enginePackPath, buildPath, projectDir } = await makeTemporaryBuild("build ok");
    await writeFile(path.join(projectDir, "gbastudio_project.json"), JSON.stringify({
      build: { target: "demo_rom" }
    }), "utf8");
    await mkdir(path.join(projectDir, "build"), { recursive: true });
    await writeFile(path.join(projectDir, "build", "demo_rom.gba"), "rom-data", "utf8");

    const result = await runGbsbuild({ enginePackPath, gbsbuildPath: buildPath, projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toEqual({
      target: "demo_rom",
      projectDir,
      buildDir: path.join(projectDir, "build"),
      romPath: path.join(projectDir, "build", "demo_rom.gba"),
      romBytes: 8
    });
  });

  it("rejects a successful build that does not materialize the ROM", async () => {
    const { enginePackPath, buildPath, projectDir } = await makeTemporaryBuild("build ok");
    await writeFile(path.join(projectDir, "gbastudio_project.json"), JSON.stringify({
      build: { target: "missing_rom" }
    }), "utf8");

    const result = await runGbsbuild({ enginePackPath, gbsbuildPath: buildPath, projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.summary?.romPath).toBe(path.join(projectDir, "build", "missing_rom.gba"));
    expect(result.summary?.romBytes).toBeUndefined();
    expect(result.error).toMatch(/ROM.*materializada/i);
  });

  it("stages gbsbuild dry-run and real build when the exported project path contains spaces", async () => {
    const { enginePackPath, buildPath, root } = await makeSpacingSensitiveBuild();
    const projectDir = path.join(root, "Project With Spaces");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "gbastudio_project.json"), JSON.stringify({
      build: { target: "space_rom" }
    }), "utf8");

    const dryRun = await runGbsbuildDryRun({ enginePackPath, gbsbuildPath: buildPath, projectDir });
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.summary?.projectDir).toBe(projectDir);
    expect(dryRun.summary?.buildDir).toBe(path.join(projectDir, "build"));

    const build = await runGbsbuild({ enginePackPath, gbsbuildPath: buildPath, projectDir });
    expect(build.exitCode).toBe(0);
    expect(build.summary?.romPath).toBe(path.join(projectDir, "build", "space_rom.gba"));
  });

  it("reuses its own staging and keeps timestamps without importing an old project ROM", async () => {
    const { enginePackPath, buildPath, root } = await makeSpacingSensitiveBuild();
    const projectDir = path.join(root, "Project With Spaces");
    await mkdir(projectDir);
    await writeFile(path.join(projectDir, "gbastudio_project.json"), JSON.stringify({build:{target:"reuse"}}));
    await writeFile(path.join(projectDir, "main.cpp"), "same-source");
    const options = {enginePackPath, gbsbuildPath:buildPath, projectDir};
    const first = await runGbsbuild(options);
    const staged = first.stdout!.replace("staged-project=", "");
    await utimes(path.join(staged, "main.cpp"), 1000, 1000);
    await writeFile(path.join(projectDir, "build/reuse.gba"), "old-ROM");
    const second = await runGbsbuild(options);
    expect(second.stdout).toBe(first.stdout);
    expect((await stat(path.join(staged, "main.cpp"))).mtimeMs).toBe(1_000_000);
    expect(await readFile(path.join(projectDir, "build/reuse.gba"), "utf8")).toBe("rom-bytes");
  });

  it("remaps equivalent staged paths reported by a POSIX make launcher", async () => {
    const { enginePackPath, buildPath, root } = await makeSpacingSensitiveBuild();
    const projectDir = path.join(root, "Project With Spaces");
    await mkdir(projectDir);
    await writeFile(path.join(projectDir, "gbastudio_project.json"), JSON.stringify({ build: { target: "paths" } }));
    const helper = path.join(enginePackPath, "tools", "gbsbuild-spaces.js");
    const source = await readFile(helper, "utf8");
    await writeFile(helper, source
      .replace('`PROJECT_DIR=${projectDir}`', "'PROJECT_DIR=' + projectDir.replaceAll(String.fromCharCode(92), '/') + '/.'")
      .replace('`BUILD_DIR=${buildDir}`', "'BUILD_DIR=' + buildDir.replaceAll(String.fromCharCode(92), '/') + '/.'"));
    const result = await runGbsbuildDryRun({ enginePackPath, gbsbuildPath: buildPath, projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.summary?.projectDir).toBe(projectDir);
    expect(result.summary?.buildDir).toBe(path.join(projectDir, "build"));
    expect(result.summary?.command).toContain(`PROJECT_DIR=${projectDir}`);
    expect(result.summary?.command).toContain(`BUILD_DIR=${path.join(projectDir, "build")}`);
  });

  it("reports concurrent staging as a build error without sharing output", async () => {
    const {enginePackPath,buildPath,root}=await makeSpacingSensitiveBuild();
    const projectDir=path.join(root,"Shared Project"); await mkdir(projectDir);
    await writeFile(path.join(projectDir,"gbastudio_project.json"),JSON.stringify({build:{target:"shared"}}));
    const helper=path.join(enginePackPath,"tools/gbsbuild-spaces.js");
    await writeFile(helper,(await readFile(helper,"utf8")).replace("mkdirSync(buildDir", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);mkdirSync(buildDir"));
    const options={enginePackPath,gbsbuildPath:buildPath,projectDir};
    const results=await Promise.all([runGbsbuild(options),runGbsbuild(options)]);
    expect(results.filter(result=>result.error)).toHaveLength(1);
    expect(results.find(result=>result.error)?.error).toMatch(/já está/);
    expect(results.filter(result=>!result.error)).toHaveLength(1);
  });

  it("automatically bounds staging while preserving active builds and the original project", async () => {
    const { enginePackPath, buildPath, root } = await makeSpacingSensitiveBuild();
    const projectDir = path.join(root, "Project With Spaces");
    await mkdir(projectDir);
    await writeFile(path.join(projectDir, "gbastudio_project.json"), JSON.stringify({ build: { target: "retained" } }));
    await writeFile(path.join(projectDir, "main.cpp"), "original-source");
    const temporary = await mkdtemp(path.join(os.tmpdir(), "gbastudio-staging-retention-"));
    temporaryRoots.push(temporary);
    const cache = path.join(temporary, "gbastudio-engine-build-cache");
    await mkdir(cache, { recursive: true });
    for (let n = 1; n <= 35; n++) {
      const entry = path.join(cache, n.toString(16).padStart(64, "0"));
      await mkdir(entry); await writeFile(path.join(entry, "data"), "cached");
      const used = (Date.now() - n * 1000) / 1000; await utimes(entry, used, used);
    }
    const old = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
    const expired = path.join(cache, "e".repeat(64)); await mkdir(expired); await utimes(expired, old, old);
    const active = path.join(cache, "f".repeat(64)); await mkdir(active); await utimes(active, old, old);
    const release = await acquireBuildLock(`${active}.lock`);
    const temporarySpy = vi.spyOn(os, "tmpdir").mockReturnValue(temporary);
    try {
      const result = await runGbsbuild({ enginePackPath, gbsbuildPath: buildPath, projectDir });
      expect(result.error).toBeUndefined();
      expect(await readFile(path.join(projectDir, "build/retained.gba"), "utf8")).toBe("rom-bytes");
      expect(await readFile(path.join(projectDir, "main.cpp"), "utf8")).toBe("original-source");
      expect((await readdir(cache)).filter(name => /^[a-f0-9]{64}$/.test(name))).toHaveLength(33); // 32 retained + the active build.
      await expect(stat(expired)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await stat(active)).isDirectory()).toBe(true);
    } finally { temporarySpy.mockRestore(); await release(); }
  });
});
