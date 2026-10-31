import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const projectURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
const diamondRootURL = new URL("../fixtures/asset-provenance/tactical-diamonds/", import.meta.url);
const retired = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/example-library-cleanup.json", import.meta.url))).retiredAssets;
const project = JSON.parse(readFileSync(projectURL, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function expandedCollisions(room) {
  const value = room.collisionTypes;
  if (Array.isArray(value)) return value;
  return value.runs.flatMap(([type, count]) => Array(count).fill(type));
}

describe("tactical provenance: archived V5 and current large Arena", () => {
  it("usa a sheet aprovada do Mercado e retira as versões substituídas da Arena", () => {
    expect(project.assets.find(a => a.name === 'market-approved-actors-64x64.png')?.metadata.reviewStatus).toBe('approved');
    expect(project.assets.some(a => a.name === 'tactical-nara-v5.png')).toBe(false);
    for (const name of ['tactical-v5-surface.png', 'tactical-v5-hud.png', 'tactical-sentinel-v5.png']) {
      expect(project.assets.some(a => a.name === name)).toBe(false);
      expect(retired.some(a => a.name === name)).toBe(true);
    }
  });

  it("liga fundo, HUD, atores, marcador e rampa à mesma arena", () => {
    const room = project.rooms.find((item) => item.name === "arena_tatica");
    expect(project.scenas.find((item) => item.name === "arena_tatica")).toEqual(room);
    expect(room.backgroundAssetName).toBe("tactical-arena-large-768x512.png");
    expect(room.cameraBounds).toEqual({x:0,y:0,width:768,height:512});
    expect(room.runtime.config.pagedSurface).toMatchObject({width:768,height:512});
    expect(room.runtime.config.tacticalPresentation.compactHud.font).toBe("tactical-compact-font-8x8.png");
    expect(room.runtime.config.tacticalPresentation.assets.filter(a=>a.consumer!=="audio")).toHaveLength(14);
    expect(expandedCollisions(room)[4*16+3]).toBe("free");
    expect(room.rampFlags[4*16+3]).toBe(8);
    expect(room.heightLevels[4*16+3]).toBe(1);
    expect(room.heightLevels[3*16+3]).toBe(2);
    for(const [who,x] of [["nara",5],["sentinel",8]]) {
      expect(project.actors.find(a=>a.id===`tactical-${who}`)).toMatchObject({x,y:9,z:0,spriteSheet:`tactical-approved-${who}-64x64.png`});
      expect(project.animations.filter(a=>a.spriteSheet===`tactical-approved-${who}-64x64.png`)).toHaveLength(24);
    }
  });

  it("mantém a proveniência dos losangos antigos fora da biblioteca e usa os marcadores 48×24", () => {
    for (const state of ['cursor', 'range', 'target']) {
      const name = `tactical-${state}-diamond-32x16-v1.png`;
      const bytes = readFileSync(new URL(`tactical-${state}-diamond-32x16-4bpp.png`, diamondRootURL));
      expect(retired.find(a => a.name === name)?.sha256).toBe(sha256(bytes));
      expect(project.assets.some(a => a.name === name)).toBe(false);
      expect(project.rooms.find(r => r.name === 'arena_tatica').runtime.config.tacticalPresentation[`${state}Asset`]).toBe("tactical-cursor-48x24.png");
      const original=readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/sprites/tactical-${state}-48x24.png`,import.meta.url));
      const shared=readFileSync(new URL("../default-assets/templates/exemplo-gba/Assets/sprites/tactical-cursor-48x24.png",import.meta.url));
      expect(sha256(original)).toBe(sha256(shared));
    }
  });

  it("preserva a arena aprovada ao reconstruir o showcase para exportação", () => {
    const rebuilt = promoteExemploGBAVerticeCampaign(project);
    const arena = rebuilt.scenas.find((scene) => scene.name === "arena_tatica");
    expect(arena.backgroundAssetName).toBe("tactical-arena-large-768x512.png");
    expect(arena.runtime.config.tacticalPresentation.cursorAsset).toBe("tactical-cursor-48x24.png");
    expect(rebuilt.assets.some((asset) => asset.name === "tactical-v5-surface.png")).toBe(false);
    expect(rebuilt.assets.some((asset) => asset.name === "tactical-v5-hud.png")).toBe(false);
    expect(rebuilt.assets.filter((asset) => asset.name?.includes("diamond-32x16-v1.png"))).toHaveLength(0);
    expect(rebuilt.animations.filter((animation) => animation.spriteSheet?.includes("diamond-32x16-v1.png"))).toHaveLength(0);
    expect(rebuilt.actors.filter((actor) => actor.roomName === "arena_tatica"))
      .toEqual(project.actors.filter((actor) => actor.roomName === "arena_tatica"));
    expect(rebuilt.animations.filter((animation) => animation.spriteSheet === "tactical-nara-v5.png"))
      .toHaveLength(0);
    expect(rebuilt.animationStates.some((state) => state.id === "tactical-sentinel-v5-state"))
      .toBe(false);
    expect(() => buildEngineExportProjectContract(rebuilt)).not.toThrow();
  });
});
