import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const runnerPath = fileURLToPath(new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url));
const sandboxes = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gba-scene-cleanup-test-"));
  sandboxes.push(root);
  const temporary = join(root, "temporary");
  const project = join(root, "my-project.gba-project");
  const evidence = join(root, "evidence.json");
  const executable = process.platform === "darwin"
    ? join(root, "fake.app", "Contents", "MacOS", "gba-studio")
    : join(root, "fake-electron");
  await mkdir(temporary);
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(executable, "not an executable", { mode: 0o644 });
  await writeFile(project, "original project");
  await writeFile(evidence, "previous evidence");
  const env = {
    ...process.env,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    GBA_STUDIO_PACKAGED_APP_PATH: process.platform === "darwin" ? join(root, "fake.app") : executable
  };
  delete env.GBA_STUDIO_KEEP_SMOKE_TEMP;
  delete env.GBA_STUDIO_SMOKE_ARCH;
  return { env, evidence, executable, project, temporary };
}

it("removes its workspace when launch preparation fails, without removing projects or evidence", async () => {
  const { env, evidence, project, temporary } = await fixture();
  env.GBA_STUDIO_SMOKE_ARCH = "invalid";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await execFileAsync(process.execPath, [runnerPath, "--packaged", "--scene=titulo"], {
      env, timeout: 15_000
    }).then(() => null, (error) => error);
    expect(result).not.toBeNull();
    expect(result.stderr).toMatch(/arquitetura|macOS/i);
    expect(await readdir(temporary)).toEqual([]);
  }
  expect(await readFile(project, "utf8")).toBe("original project");
  expect(await readFile(evidence, "utf8")).toBe("previous evidence");
});

it("removes its workspace when the Electron executable cannot be spawned", async () => {
  const { env, executable, temporary } = await fixture();
  await rm(executable);
  await mkdir(executable);
  const result = await execFileAsync(process.execPath, [runnerPath, "--packaged", "--scene=titulo"], {
    env, timeout: 15_000
  }).then(() => null, (error) => error);
  expect(result).not.toBeNull();
  expect(result.stderr).toMatch(/EACCES|EINVAL|ENOEXEC|UNKNOWN|spawn/i);
  expect(await readdir(temporary)).toEqual([]);
});
