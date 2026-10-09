import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  enginePackPathFromRepo,
  GBA_STUDIO_ENGINE_REPO_URL,
  resolveEnginePackCandidatePaths,
  resolveDefaultEnginePackPath
} from "./enginePackPaths.js";

describe("enginePackPaths", () => {
  it("points to the engine source inside the canonical monorepo", () => {
    expect(GBA_STUDIO_ENGINE_REPO_URL).toBe(
      "https://github.com/matmel0/GBA-Studio/tree/main/packages/GBAStudioEngine"
    );
  });

  it("derives the pack path from a repo checkout", () => {
    expect(enginePackPathFromRepo("/tmp/GBAStudioEngine")).toBe(
      path.join("/tmp/GBAStudioEngine", "dist", "GBAStudioEnginePack")
    );
  });

  it("prefers explicit pack env over repo env and defaults", () => {
    expect(resolveDefaultEnginePackPath({
      envPackPath: "/packs/custom",
      envRepoPath: "/repos/GBAStudioEngine",
      homeDir: "/home/dev"
    })).toBe("/packs/custom");
  });

  it("lists explicit and packaged engine paths without legacy checkout fallbacks", () => {
    const candidates = resolveEnginePackCandidatePaths({
      envRepoPath: "/repos/GBAStudioEngine",
      appPath: "/workspace/GBA 2/apps/desktop-electron",
      homeDir: "/home/dev",
      resourcesPath: "/Applications/GBA Studio.app/Contents/Resources"
    });

    expect(candidates.map((candidate) => candidate.label)).toEqual([
      "Variavel de ambiente (repo)",
      "Recursos do aplicativo"
    ]);
    expect(candidates[0]?.path).toBe(path.join("/repos/GBAStudioEngine", "dist", "GBAStudioEnginePack"));
  });

  it("prefers the embedded monorepo engine checkout when present", () => {
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    const embeddedRepo = path.join(workspaceRoot, "packages", "GBAStudioEngine");
    if (!existsSync(path.join(embeddedRepo, "enginepack.json"))) {
      return;
    }

    const candidates = resolveEnginePackCandidatePaths({
      appPath: path.join(workspaceRoot, "apps", "desktop-electron"),
      homeDir: "/home/dev"
    });
    expect(candidates.some((candidate) => candidate.label === "Engine no monorepo")).toBe(true);
    expect(resolveDefaultEnginePackPath({
      appPath: path.join(workspaceRoot, "apps", "desktop-electron"),
      homeDir: "/home/dev"
    })).toBe(path.join(embeddedRepo, "dist", "GBAStudioEnginePack"));
  });
});
