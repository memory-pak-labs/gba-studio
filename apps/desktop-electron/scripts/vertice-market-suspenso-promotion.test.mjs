import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { promoteMarketAdventure } from "./market-adventure-promotion.mjs";
import {
  promoteApprovedMarketSuspensoActors,
  promoteExemploGBAVerticeCampaign
} from "./vertice-showcase-project.mjs";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

describe("promoção do background novo do Mercado Suspenso", () => {
  it("remove versões já aprovadas no passado quando o manifesto atual não as declara", async () => {
    const original = structuredClone(JSON.parse(await readFile(templateURL, "utf8")));
    original.assets.push({ name: "nara-mercado-isometric-v2.png", metadata: { reviewStatus: "approved" } });
    original.animations.push({ id: "retired-nara-animation", spriteSheet: "nara-mercado-isometric-v2.png" });
    original.animationStates.push({ id: "retired-nara-state", spriteSheet: "nara-mercado-isometric-v2.png" });

    const project = promoteExemploGBAVerticeCampaign(original);

    expect(project.assets.some((asset) => asset.name === "nara-mercado-isometric-v2.png")).toBe(false);
    expect(project.animations.some((animation) => animation.spriteSheet === "nara-mercado-isometric-v2.png")).toBe(false);
    expect(project.animationStates.some((state) => state.spriteSheet === "nara-mercado-isometric-v2.png")).toBe(false);
    expect(project.assets.map((asset) => asset.name).sort()).toEqual(
      JSON.parse(await readFile(templateURL, "utf8")).assets.map((asset) => asset.name).sort()
    );
  });

  it("mantém os atores e assets ativos do manifesto, sem reintroduzir versões aposentadas", async () => {
    const original = JSON.parse(await readFile(templateURL, "utf8"));
    const project = promoteApprovedMarketSuspensoActors(original);
    expect(project).toEqual(promoteMarketAdventure(original));
    const marketActors = project.actors
      .filter((actor) => actor.roomName === "mercado_suspenso")
      .map(({ id, spriteSheet, animationStateID }) => ({ id, spriteSheet, animationStateID }))
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(marketActors).toEqual([
      { id: "market-guard-v1", spriteSheet: "market-adventure-guard.png", animationStateID: "market-adventure-guard-state" },
      { id: "market-nara", spriteSheet: "tactical-nara-v5.png", animationStateID: "market-adventure-player-state" },
      { id: "market-trader-v2", spriteSheet: "market-adventure-merchant.png", animationStateID: "market-adventure-merchant-state" }
    ]);
    expect(project.assets.map((asset) => asset.name).sort()).toEqual(original.assets.map((asset) => asset.name).sort());
    expect(project.assets.some((asset) => [
      "nara-mercado-isometric-v2.png",
      "market-adventurer-isometric-v1-idle.png",
      "market-merchant-isometric-v1-idle.png",
      "market-guard-isometric-v1-idle.png",
      "mercado-suspenso-gba.png",
      "mercado-suspenso-modules-v5.png"
    ].includes(asset.name))).toBe(false);
    expect(project.animations.some((animation) => /isometric-v1-idle|nara-mercado-isometric-v2/.test(animation.spriteSheet ?? "")))
      .toBe(false);
  });

  it("materializa a composição contínua aprovada sem perder a exploração do Mercado", async () => {
    const original = JSON.parse(await readFile(templateURL, "utf8"));
    const project = promoteExemploGBAVerticeCampaign(original);
    const market = project.scenas.find((scene) => scene.name === "mercado_suspenso");
    expect(project.assets.map((asset) => asset.name).sort()).toEqual(original.assets.map((asset) => asset.name).sort());
    expect(project.assets.find((candidate) => candidate.name === "market-gba.png")).toBeUndefined();
    expect(market).toMatchObject({
      width: 36, height: 36,
      backgroundAssetName: "mercado-adventure-surface.png",
      tilesetAssetName: "mercado-adventure-surface.png",
      gbStudioUseBackgroundLayout: true,
      playerActorName: "Aventureiro · Mercado",
      tileLayers: [],
      runtime: { type: "isometric", config: {
        tileWidth: 24, tileHeight: 12, heightStep: 16,
        gameplayMode: "adventure", movement: "free", worldMode: "scrollable_tiled_world",
        pagedSurface: { backgroundAsset: "mercado-adventure-surface.png", foregroundAsset: "mercado-adventure-foreground.png", width: 512, height: 344 }
      } }
    });
    expect(market.heightLevels).toHaveLength(market.width * market.height);
    expect(project.actors.filter((actor) => actor.roomName === "mercado_suspenso")).toEqual(expect.arrayContaining([
      expect.objectContaining({ spriteSheet: "tactical-nara-v5.png", animationStateID: "market-adventure-player-state" }),
      expect.objectContaining({ spriteSheet: "market-adventure-merchant.png", animationStateID: "market-adventure-merchant-state" }),
      expect.objectContaining({ spriteSheet: "market-adventure-guard.png", animationStateID: "market-adventure-guard-state" })
    ]));
    for (const name of ["mercado-adventure-surface.png", "mercado-adventure-foreground.png", "market-adventure-merchant.png", "market-adventure-guard.png"]) {
      expect(project.assets.find((asset) => asset.name === name)?.metadata?.reviewStatus).toBe("approved");
    }
  });

  it("não mantém sincronizadores para fundos, módulos ou atores aposentados do Mercado", async () => {
    const assetModule = await import("./vertice-showcase-assets.mjs");
    expect(assetModule.VERTICE_MARKET_SUSPENSO_BACKGROUND_LAYOUT).toEqual([]);
    expect(assetModule.VERTICE_MARKET_SUSPENSO_TILESET_LAYOUT).toEqual([]);
    expect(assetModule.VERTICE_MARKET_SUSPENSO_ACTOR_LAYOUT).toEqual([]);

    const root = await mkdtemp(path.join(os.tmpdir(), "retired-market-assets-"));
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const currentProject = { assets: [{ name: "mercado-adventure-surface.png", metadata: { source: "Assets/backgrounds/mercado-adventure-surface.png" } }] };
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, JSON.stringify(currentProject)),
      writeFile(fixtureProjectPath, JSON.stringify(currentProject))
    ]);
    const syncResults = await Promise.all([
      assetModule.syncVerticeMarketSuspensoBackground({ templateProjectPath, fixtureProjectPath }),
      assetModule.syncVerticeMarketSuspensoTileset({ templateProjectPath, fixtureProjectPath }),
      assetModule.syncVerticeMarketSuspensoActors({ templateProjectPath, fixtureProjectPath })
    ]);

    expect(syncResults).toEqual(syncResults.map(() => ({ templateAssets: [], fixtureAssets: [] })));
  });
});
