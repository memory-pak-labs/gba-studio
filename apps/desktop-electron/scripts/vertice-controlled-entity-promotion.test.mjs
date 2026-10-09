import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT,
  syncVerticeControlledEntityAssets
} from "./vertice-showcase-assets.mjs";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

describe("pilotos de entidades controláveis de Vértice", () => {
  it("declara somente as cinco folhas aprovadas e as copia para template e fixture", async () => {
    expect(VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT.map(({ name }) => name)).toEqual([
      "nara-platformer.png",
      "nara-isometric.png",
      "nara-flight.png",
      "nara-fighter.png",
      "nara-racer.png"
    ]);
    expect(VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT.map(({ source }) => source)).toEqual([
      "platformer/prepared/v2/vertice-nara-platformer-pilot.png",
      "isometric/prepared/v2/vertice-nara-isometric-pilot.png",
      "shmup/prepared/v2/vertice-aurora-kite-pilot.png",
      "luta/prepared/v2/vertice-nara-fighter-pilot.png",
      "racing/prepared/v2/vertice-lumen-skiff-pilot.png"
    ]);

    const root = await fsTempRoot();
    const sourceDirectory = path.join(root, "controlled-entity-pilots");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT.map(async (asset, index) => {
        const source = path.join(sourceDirectory, asset.source);
        await mkdir(path.dirname(source), { recursive: true });
        await writeFile(source, `pilot-${index}`);
      })
    ]);

    const synced = await syncVerticeControlledEntityAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT.length);
    expect(synced.fixtureAssets).toHaveLength(VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT.length);
    await Promise.all(VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT.flatMap((asset) => [
      access(path.join(path.dirname(templateProjectPath), "Assets", asset.destination, asset.name)),
      access(path.join(path.dirname(fixtureProjectPath), "Assets", asset.destination, asset.name))
    ]));
    expect(await readFile(path.join(path.dirname(templateProjectPath), "Assets", "sprites", "nara-platformer.png"), "utf8"))
      .toBe("pilot-0");
  });

  it("mantém os pilotos recusados fora do template e preserva o player atual da Tempestade", () => {
    const project = promoteExemploGBAVerticeCampaign(JSON.parse(readFileSync(templateURL, "utf8")));
    const declinedNames = [
      "nara-platformer.png",
      "nara-isometric.png"
    ];

    expect(project.assets.filter((asset) => declinedNames.includes(asset.name))).toEqual([]);
    expect(project.assets.find((asset) => asset.name === "tempestade-v3-player.png")).toEqual(expect.objectContaining({
      name: "tempestade-v3-player.png",
      metadata: expect.objectContaining({ reviewStatus: "approved" })
    }));
    expect(project.animations.some((animation) => animation.spriteSheet === "tempestade-v3-player.png")).toBe(true);
    expect(project.animations.filter((animation) => declinedNames.includes(animation.spriteSheet))).toEqual([]);
    expect(project.animationStates.filter((state) => declinedNames.includes(state.spriteSheet))).toEqual([]);
  });

  it("não registra folhas recusadas ou substituídas no catálogo atual", () => {
    const project = promoteExemploGBAVerticeCampaign(JSON.parse(readFileSync(templateURL, "utf8")));
    for (const name of [
      "nara-platformer.png",
      "nara-isometric.png",
      "nara-flight.png"
    ]) {
      expect(project.assets.some((asset) => asset.name === name)).toBe(false);
    }
  });
});

async function fsTempRoot() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "controlled-entity-"));
}
