import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { publishEnginePackRomToProjectRoot } from "./projectRomPublication.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project ROM publication", () => {
  it("copies the generated ROM to the project root and reports the public path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-project-rom-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "meu_jogo.gba-project");
    const buildDir = path.join(root, "build", "engine", "build");
    const buildRomPath = path.join(buildDir, "meu_jogo.gba");
    await mkdir(buildDir, { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(buildRomPath, "rom-bytes", "utf8");

    const result = await publishEnginePackRomToProjectRoot({
      ran: true,
      exitCode: 0,
      summary: {
        target: "meu_jogo",
        projectDir: path.dirname(buildDir),
        buildDir,
        romPath: buildRomPath
      }
    }, projectPath);

    const publishedPath = path.join(root, "meu_jogo.gba");
    expect(result.summary?.romPath).toBe(publishedPath);
    await expect(readFile(publishedPath, "utf8")).resolves.toBe("rom-bytes");
    await expect(readFile(buildRomPath, "utf8")).resolves.toBe("rom-bytes");
  });

  it("does not publish failed builds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-project-rom-"));
    temporaryRoots.push(root);
    const result = {
      ran: true,
      exitCode: 1,
      error: "build failed"
    };

    await expect(publishEnginePackRomToProjectRoot(result, path.join(root, "game.gba-project"))).resolves.toEqual(result);
  });
});

it("keeps the event source map beside the copied Play ROM", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-source-map-")); temporaryRoots.push(root);
  const buildDir = path.join(root, "build"); await mkdir(buildDir);
  const romPath = path.join(buildDir, "game.gba"); await writeFile(romPath, "rom");
  const map = { schema: 1, romSha256: "hash", entries: [{ address: 0x08000000, eventID: "door", stepID: "open" }] };
  await writeFile(path.join(buildDir, "event_source_map.json"), JSON.stringify(map));
  await publishEnginePackRomToProjectRoot({ ran: true, exitCode: 0, summary: { target: "game", projectDir: root, buildDir, romPath } }, path.join(root, "game.gba-project"));
  await expect(readFile(path.join(root, "game.gba.events.json"), "utf8")).resolves.toBe(JSON.stringify(map));
});
