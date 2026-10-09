import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const workspaceRoot = path.resolve(appRoot, "..", "..");
const embeddedPack = path.join(workspaceRoot, "packages", "GBAStudioEngine", "dist", "GBAStudioEnginePack");

const envKeys = [
  "GBA_STUDIO_ENGINE_PACK_DIR",
  "GBA_STUDIO_ENGINE_PACK_SOURCE",
  "GBA_STUDIO_ENGINE_REPO"
];

const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

describe("resolveEnginePackRoot", () => {
  it("prefers the embedded monorepo engine pack when present", () => {
    for (const key of envKeys) delete process.env[key];
    if (!existsSync(path.join(workspaceRoot, "packages", "GBAStudioEngine", "enginepack.json"))) {
      return;
    }
    expect(resolveEnginePackRoot(appRoot)).toBe(embeddedPack);
  });

  it("prefers explicit pack env over embedded checkout", () => {
    for (const key of envKeys) delete process.env[key];
    process.env.GBA_STUDIO_ENGINE_PACK_DIR = "/packs/custom";
    expect(resolveEnginePackRoot(appRoot)).toBe("/packs/custom");
  });
});
