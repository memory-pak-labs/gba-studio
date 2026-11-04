import { afterEach, expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createTemporarySmokeWorkspace } from "./temporary-smoke-workspace.mjs";

const workspaces = [];
const sandboxes = [];
const children = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
  }
  for (const workspace of workspaces.splice(0)) {
    await workspace.dispose().catch(() => {});
    await rm(workspace.path, { recursive: true, force: true });
  }
  await Promise.all(sandboxes.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function sandbox() {
  const path = await mkdtemp(join(tmpdir(), "gba-smoke-workspace-test-"));
  sandboxes.push(path);
  return path;
}

async function workspace(stop) {
  vi.stubEnv("GBA_STUDIO_KEEP_SMOKE_TEMP", "0");
  const result = await createTemporarySmokeWorkspace("gba-smoke-workspace-", stop);
  workspaces.push(result);
  await mkdir(join(result.path, "EngineExport", "build"), { recursive: true });
  await writeFile(join(result.path, "EngineExport", "build", "game.gba"), "generated ROM");
  return result;
}

it("stops the owned app before deleting exports and removes signal handlers across repeated runs", async () => {
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  for (let run = 0; run < 3; run += 1) {
    let current;
    const stop = vi.fn(async () => {
      expect(await readFile(join(current.path, "EngineExport/build/game.gba"), "utf8")).toBe("generated ROM");
    });
    current = await workspace(stop);
    await Promise.all([current.dispose(), current.dispose()]);
    expect(stop).toHaveBeenCalledOnce();
    await expect(access(current.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
  }
});

it("still removes temporary exports if shutting down the app fails", async () => {
  const current = await workspace(async () => { throw new Error("shutdown failed"); });
  await expect(current.dispose()).rejects.toThrow("shutdown failed");
  await expect(access(current.path)).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps the engine staging cache of subprocesses inside the disposable workspace", async () => {
  const current = await workspace();
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e",
    "import { tmpdir } from 'node:os'; console.log(tmpdir());"
  ], { env: { ...process.env, ...current.env } });
  expect(stdout.trim()).toBe(current.path);
  const staging = join(stdout.trim(), "gbastudio-engine-build-cache", "entry");
  await mkdir(staging, { recursive: true });
  await writeFile(join(staging, "object.o"), "generated object");
  await current.dispose();
  await expect(access(staging)).rejects.toMatchObject({ code: "ENOENT" });
});

it.skipIf(process.platform === "win32")("preserves external projects, art and evidence reached through a symlink", async () => {
  const source = await sandbox();
  await mkdir(join(source, "Assets"));
  await writeFile(join(source, "my-project.gba-project"), "original project");
  await writeFile(join(source, "Assets", "art.png"), "original art");
  await writeFile(join(source, "evidence.json"), "previous evidence");
  const current = await workspace();
  await symlink(source, join(current.path, "source"), "dir");
  await current.dispose();
  expect(await readFile(join(source, "my-project.gba-project"), "utf8")).toBe("original project");
  expect(await readFile(join(source, "Assets", "art.png"), "utf8")).toBe("original art");
  expect(await readFile(join(source, "evidence.json"), "utf8")).toBe("previous evidence");
});

it("retains a workspace only when explicitly requested for debugging", async () => {
  vi.stubEnv("GBA_STUDIO_KEEP_SMOKE_TEMP", "1");
  const warning = vi.spyOn(console, "error").mockImplementation(() => {});
  const current = await createTemporarySmokeWorkspace("gba-smoke-workspace-");
  workspaces.push(current);
  await current.dispose();
  await expect(access(current.path)).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledWith(`Diretório temporário preservado: ${current.path}`);
});

it("rejects prefixes that could create a directory outside the temporary root", async () => {
  await expect(createTemporarySmokeWorkspace("../my-project")).rejects.toThrow(/prefixo/i);
});

it.skipIf(process.platform === "win32").each([
  ["SIGINT", 130], ["SIGTERM", 143]
])("stops the owned child and removes its workspace on %s", async (signal, expectedCode) => {
  const root = await sandbox();
  const marker = join(root, "stopped.txt");
  const helper = new URL("./temporary-smoke-workspace.mjs", import.meta.url).href;
  const electronHelper = new URL("./electron-smoke-helpers.mjs", import.meta.url).href;
  const code = `
    import { spawn } from 'node:child_process';
    import { once } from 'node:events';
    import { writeFile } from 'node:fs/promises';
    import { createTemporarySmokeWorkspace } from ${JSON.stringify(helper)};
    import { terminateChild } from ${JSON.stringify(electronHelper)};
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    await once(child, 'spawn');
    const workspace = await createTemporarySmokeWorkspace('signal-workspace-', async () => {
      await terminateChild(child);
      await writeFile(${JSON.stringify(marker)}, 'stopped');
    });
    await writeFile(workspace.path + '/export.gba', 'generated ROM');
    process.send({ path: workspace.path, childPid: child.pid });
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, TMPDIR: root, TMP: root, TEMP: root, GBA_STUDIO_KEEP_SMOKE_TEMP: "0" },
    stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  children.push(child);
  const ready = await new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("message", resolve);
    child.once("error", reject);
    child.once("exit", () => reject(new Error(`Workspace did not start: ${stderr}`)));
  });
  const exited = once(child, "exit");
  child.kill(signal);
  expect(await exited).toEqual([expectedCode, null]);
  expect(await readFile(marker, "utf8")).toBe("stopped");
  await expect(access(ready.path)).rejects.toMatchObject({ code: "ENOENT" });
  expect(() => process.kill(ready.childPid, 0)).toThrow();
});
