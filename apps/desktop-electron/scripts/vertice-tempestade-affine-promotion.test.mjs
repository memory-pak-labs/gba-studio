import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_TEMPESTADE_AFFINE_BACKGROUND_LAYOUT,
  syncVerticeTempestadeAffineBackground
} from "./vertice-showcase-assets.mjs";

const APPROVED_BACKGROUND = "shmup-background-affine-1024.png";

describe("sincronização da fonte do background Affine", () => {
  it("declara o layout aprovado e sincroniza template e fixture", async () => {
    expect(VERTICE_TEMPESTADE_AFFINE_BACKGROUND_LAYOUT).toEqual([{
      source: "prepared/shmup-background-affine-1024.png",
      name: APPROVED_BACKGROUND,
      destination: "backgrounds"
    }]);

    const root = await fsTempRoot();
    const sourceDirectory = path.join(root, "production");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const sourcePath = path.join(sourceDirectory, "prepared", APPROVED_BACKGROUND);
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true }),
      mkdir(path.dirname(sourcePath), { recursive: true })
    ]);
    await writeFile(sourcePath, "approved-affine-background");
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);

    const synced = await syncVerticeTempestadeAffineBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(1);
    expect(synced.fixtureAssets).toHaveLength(1);
    await Promise.all([
      access(path.join(path.dirname(templateProjectPath), "Assets", "backgrounds", APPROVED_BACKGROUND)),
      access(path.join(path.dirname(fixtureProjectPath), "Assets", "backgrounds", APPROVED_BACKGROUND))
    ]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", "backgrounds", APPROVED_BACKGROUND), "utf8"))
      .resolves.toBe("approved-affine-background");
  });

});

async function fsTempRoot() {
  return (await import("node:fs/promises")).mkdtemp(path.join(os.tmpdir(), "tempestade-affine-"));
}
