import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_TEMPESTADE_BASE_BACKGROUND_LAYOUT,
  syncVerticeTempestadeBaseBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção da BG base da Tempestade", () => {
  it("mantém o background aprovado atualmente ligado à Tempestade", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const projectPath = path.join(repositoryRoot, "apps", "desktop-electron", "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    const scene = project.scenas.find((room) => room.name === "tempestade");
    const asset = project.assets.find((entry) => entry.name === scene?.backgroundAssetName);
    const source = asset?.metadata?.source;
    expect(source).toMatch(/^Assets\/backgrounds\//);
    const target = path.join(path.dirname(projectPath), source);
    await access(target);
    expect(asset?.metadata).toMatchObject({ reviewStatus: "approved", visualStatus: "approved" });
    expect(createHash("sha256").update(await readFile(target)).digest("hex"))
      .toBe(asset?.metadata?.preparedSha256);
  });

  it("copia a fonte preparada v15 igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tempestade-base-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const asset = VERTICE_TEMPESTADE_BASE_BACKGROUND_LAYOUT[0];
    const source = path.join(sourceDirectory, asset.source);

    await Promise.all([
      mkdir(path.dirname(source), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);
    await writeFile(source, "approved-v15-pixels");

    const synced = await syncVerticeTempestadeBaseBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    const target = path.join("Assets", asset.destination, asset.name);
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), target)]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), target)]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
      .resolves.toBe("approved-v15-pixels");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
      .resolves.toBe("approved-v15-pixels");
  });
});
