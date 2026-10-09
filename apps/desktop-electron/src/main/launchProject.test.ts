import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadLaunchProject, resolveCurrentLaunchProjectPath, resolveLaunchProject, resolveLaunchProjectPath } from "./launchProject.js";

const temporaryRoots: string[] = [];
const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project");

async function makeTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("launch project bootstrap", () => {
  it("prefers the explicit environment path and resolves it from cwd", () => {
    expect(
      resolveLaunchProjectPath({
        argv: ["electron", "."],
        cwd: "/workspace/app",
        env: { GBA_STUDIO_OPEN_PROJECT: "default-assets/templates/exemplo-gba/exemplo-gba.gba-project" }
      })
    ).toBe(path.resolve("/workspace/app", "default-assets/templates/exemplo-gba/exemplo-gba.gba-project"));
  });

  it("reads --open-project arguments when the environment is not set", () => {
    expect(
      resolveLaunchProjectPath({
        argv: ["electron", ".", "--open-project=/tmp/demo.gba-project"],
        cwd: "/workspace/app",
        env: {}
      })
    ).toBe(path.resolve("/tmp/demo.gba-project"));

    expect(
      resolveLaunchProjectPath({
        argv: ["electron", ".", "--open-project", "fixtures/demo.gba-project"],
        cwd: "/workspace/app",
        env: {}
      })
    ).toBe(path.resolve("/workspace/app", "fixtures/demo.gba-project"));
  });

  it("accepts a standalone .gba-project argument from desktop file associations", () => {
    expect(
      resolveLaunchProjectPath({
        argv: ["GBA Studio", "Projects/Example.gba-project"],
        cwd: "/workspace/app",
        env: {}
      })
    ).toBe(path.resolve("/workspace/app", "Projects/Example.gba-project"));

    expect(
      resolveLaunchProjectPath({
        argv: ["GBA Studio", "--inspect", "/tmp/Example.gbastudio"],
        cwd: "/workspace/app",
        env: {}
      })
    ).toBe(path.resolve("/tmp/Example.gbastudio"));

    expect(
      resolveLaunchProjectPath({
        argv: ["GBA Studio", "/tmp/Example.gbsproj"],
        cwd: "/workspace/app",
        env: {}
      })
    ).toBe(path.resolve("/tmp/Example.gbsproj"));
  });

  it("resolves the current launch project path at call time", () => {
    expect(resolveCurrentLaunchProjectPath({
      GBA_STUDIO_OPEN_PROJECT: fixturePath
    })).toBe(fixturePath);
  });

  it("loads a launch project through the normal .gba-project parser", async () => {
    const root = await makeTemporaryRoot("gbastudio-launch-project-");
    const projectPath = path.join(root, "Launch.gba-project");
    await writeFile(
      projectPath,
      JSON.stringify({
        schemaVersion: 1,
        name: "Launch Demo",
        rooms: [{ id: "room-1", name: "Start" }],
        assets: [{ id: "asset-1", name: "hero.png" }]
      }),
      "utf8"
    );

    const result = await loadLaunchProject(projectPath);

    expect(result).toEqual({
      canceled: false,
      path: projectPath,
      project: {
        data: {
          schemaVersion: 1,
          name: "Launch Demo",
          rooms: [{ id: "room-1", name: "Start" }],
          assets: [{ id: "asset-1", name: "hero.png" }]
        },
        summary: {
          schemaVersion: 1,
          name: "Launch Demo",
          rooms: 1,
          assets: 1
        }
      }
    });
  });

  it("loads the complete bundled template through the launch-project path", async () => {
    const result = await loadLaunchProject(fixturePath);

    expect(result).toMatchObject({
      canceled: false,
      path: fixturePath,
      project: {
        summary: {
          schemaVersion: 1,
          name: "O Último Farol",
          rooms: expect.any(Number),
          assets: expect.any(Number)
        }
      }
    });
    expect(result.project?.summary.rooms).toBeGreaterThan(0);
    expect(result.project?.summary.rooms).toBe((result.project?.data.rooms as unknown[]).length);
    expect(result.project?.summary.assets).toBe((result.project?.data.assets as unknown[]).length);
  });

  it("returns a renderer-safe error when the launch project cannot be parsed", async () => {
    const root = await makeTemporaryRoot("gbastudio-launch-project-");
    const projectPath = path.join(root, "Broken.gba-project");
    await writeFile(projectPath, "[]", "utf8");

    const result = await loadLaunchProject(projectPath);

    expect(result).toMatchObject({
      canceled: false,
      path: projectPath,
      error: "Arquivo .gba-project precisa conter um objeto JSON."
    });
  });

  it("shows the welcome screen by default when no launch path is configured", async () => {
    const result = await resolveLaunchProject({
      argv: ["electron", "."],
      cwd: "/workspace/app",
      env: {}
    });

    expect(result).toEqual({ canceled: true });
  });

  it("prefers an explicit launch project over the welcome screen", async () => {
    const result = await resolveLaunchProject({
      argv: ["electron", ".", "--open-project", fixturePath],
      cwd: path.dirname(fixturePath),
      env: {}
    });

    expect(result).toMatchObject({
      canceled: false,
      path: fixturePath,
      project: {
        summary: {
          name: "O Último Farol"
        }
      }
    });
  });
});
