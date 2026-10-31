import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodePngRgba } from "./lib/png-icons.mjs";
import { buildIsometricActorAnimations } from "../src/main/exportEngineProject.ts";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "../src/shared/engineProjectExport.ts";

const root = new URL("../default-assets/templates/exemplo-gba/", import.meta.url);
const project = JSON.parse(readFileSync(new URL("exemplo-gba.gba-project", root), "utf8"));
const sheet = "market-approved-actors-64x64.png";

describe("Mercado: animações isométricas em oito direções", () => {
  it("mantém as animações anteriores e associa as quatro vistas adicionais ao ator", () => {
    const actor = project.actors.find((item) => item.id === "market-nara");
    const state = project.animationStates.find((item) => item.id === actor.animationStateID);
    expect(actor.spriteSheet).toBe(sheet);
    for (const direction of ["down", "up", "left", "right"]) {
      for (const motion of ["idle", "walk"]) {
        const oldID = `market-approved-player-${motion}_${direction}`;
        const newID = `market-approved-player-${motion}_screen_${direction}`;
        expect(state.animationIDs).toContain(oldID);
        expect(state.animationIDs).toContain(newID);
        const animation = project.animations.find((item) => item.id === newID);
        expect(animation).toMatchObject({ spriteSheet: sheet, direction: `screen_${direction}`, state: motion });
        expect(animation.frames).toHaveLength(motion === "idle" ? 1 : 3);
        for (const frame of animation.frames) {
          expect(frame.sourceFrameIndex).toBeGreaterThanOrEqual(28);
          expect(frame.sourceFrameIndex).toBeLessThan(44);
          expect(frame.tiles[0].sliceX).toBe(frame.sourceFrameIndex * 64);
        }
      }
    }
    const png = readFileSync(new URL(`Assets/sprites/${sheet}`, root));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2816, 64]);
  });

  it("exporta os clips novos sem substituir os quatro clips legados", () => {
    const actor = project.actors.find((item) => item.id === "market-nara");
    const sprite = buildActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project), { directionAdapter: "isometric" });
    const animations = buildIsometricActorAnimations(sprite.animations);
    for (const direction of ["down", "up", "left", "right"]) {
      for (const motion of ["idle", "walk"]) {
        expect(animations.find((item) => item.name === `${motion}_${direction}`)).toBeDefined();
        expect(animations.find((item) => item.name === `${motion}_screen_${direction}`)).toBeDefined();
      }
    }
  });

  it("mantém a proporção e o apoio das poses laterais em relação às demais", () => {
    const image = decodePngRgba(readFileSync(new URL(`Assets/sprites/${sheet}`, root)));
    const metrics = (direction) => {
      const animation = project.animations.find((item) => item.name === `walk_screen_${direction}` && item.spriteSheet === sheet);
      return animation.frames.map((frame) => {
        let minX = 64, maxX = -1, minY = 64, maxY = -1;
        for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
          const offset = (y * image.width + frame.sourceFrameIndex * 64 + x) * 4;
          if (image.pixels[offset + 3] === 0) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        return { width: maxX - minX + 1, height: maxY - minY + 1, foot: maxY + 1 - frame.originY };
      });
    };
    const frontBack = [...metrics("up"), ...metrics("down")];
    const sides = [...metrics("left"), ...metrics("right")];
    expect(Math.max(...sides.map((item) => item.width))).toBeLessThanOrEqual(Math.max(...frontBack.map((item) => item.width)) + 1);
    expect(Math.max(...sides.map((item) => item.height)) - Math.min(...frontBack.map((item) => item.height))).toBeLessThanOrEqual(4);
    const feet = [...frontBack, ...sides].map((item) => item.foot);
    expect(Math.max(...feet) - Math.min(...feet)).toBeLessThanOrEqual(3);
  });
});
