import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { desktopAssetURL } from "../shared/spriteAssetURL.js";
import { isPathInsideDirectory, resolveDesktopAssetPath } from "./desktopAssetProtocol.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("desktop asset protocol", () => {
  it("resolves an asset inside an authorized project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "gba-studio-assets-"));
    temporaryDirectories.push(projectRoot);
    const assetPath = join(projectRoot, "Assets", "sprites", "hero space.png");
    await mkdir(join(projectRoot, "Assets", "sprites"), { recursive: true });
    await writeFile(assetPath, "png-placeholder", "utf8");

    await expect(resolveDesktopAssetPath(desktopAssetURL(assetPath), [projectRoot])).resolves.toBe(await realpath(assetPath));
  });

  it("rejects an asset outside every authorized project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "gba-studio-assets-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "gba-studio-outside-"));
    temporaryDirectories.push(projectRoot, outsideRoot);
    const assetPath = join(outsideRoot, "sprite.png");
    await writeFile(assetPath, "png-placeholder", "utf8");

    await expect(resolveDesktopAssetPath(desktopAssetURL(assetPath), [projectRoot])).resolves.toBeNull();
  });

  it("does not treat a similarly prefixed directory as inside the project root", () => {
    expect(isPathInsideDirectory("/tmp/game-assets-elsewhere/sprite.png", "/tmp/game-assets")).toBe(false);
  });
});
