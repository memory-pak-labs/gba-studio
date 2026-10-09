import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { promoteApprovedOpeningV3, OPENING_V3_FILES } from "./opening-v3-promotion.mjs";
import { promoteApprovedOpeningV2 } from "./opening-v2-promotion.mjs";

const projectPath = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
const readProject = () => JSON.parse(readFileSync(projectPath, "utf8"));

describe("opening-v3 promotion", () => {
  it("troca somente a arte aprovada da abertura e preserva o ritmo e os eventos", () => {
    const source = readProject();
    const promoted = promoteApprovedOpeningV3(source);
    const scene = promoted.rooms.find((room) => room.name === "abertura");
    const original = source.rooms.find((room) => room.name === "abertura");
    const actors = promoted.actors.filter((actor) => actor.roomName === "abertura");

    expect(promoted.rooms).toHaveLength(source.rooms.length);
    expect(promoted.rooms.find((room) => room.name === "titulo"))
      .toEqual(source.rooms.find((room) => room.name === "titulo"));
    expect(scene.backgroundAssetName).toBe(original.backgroundAssetName);
    expect(promoted.scenas.find((room) => room.name === "abertura")).toEqual(scene);
    expect(scene.runtime.config.steps.map((step) => step.id)).toEqual(
      original.runtime.config.steps.map((step) => step.id.replace(/^opening-v2-/, "opening-v3-"))
    );
    expect(scene.runtime.config.steps.map((step) => step.durationFrames))
      .toEqual(original.runtime.config.steps.map((step) => step.durationFrames));
    expect(scene.runtime.config.steps.map((step) => step.eventName))
      .toEqual(original.runtime.config.steps.map((step) => step.eventName));
    expect(scene.runtime.config.steps.map((step) => step.actorMotions))
      .toEqual(original.runtime.config.steps.map((step) => step.actorMotions));
    expect(scene.runtime.config.steps.map((step) => step.backgroundAssetName))
      .toEqual(original.runtime.config.steps.map((step) => step.backgroundAssetName));
    expect(actors.map((actor) => actor.id)).toEqual([
      "opening-v3-actor-guardia-idle",
      "opening-v3-actor-guardia-turn",
      "opening-v3-actor-guardia-signal",
      "opening-v3-actor-menino",
      "opening-v3-actor-gaivota"
    ]);
    expect(actors.map((actor) => actor.spriteSheet)).toEqual(OPENING_V3_FILES.map((file) => file.name));
    expect(promoted.events).toEqual(source.events);
    expect(promoted.assets.some((asset) => asset.id === "opening-v3-background")).toBe(false);
    for (const { name } of OPENING_V3_FILES) {
      expect(promoted.assets.some((asset) => asset.name === name)).toBe(true);
    }
    for (const { folder, name, sha256 } of OPENING_V3_FILES) {
      const bytes = readFileSync(new URL(`Assets/${folder}/${name}`, projectPath));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    }
    expect(promoted.assets.some((asset) => asset.id.startsWith("opening-v2-"))).toBe(false);
    expect(promoted.animations.some((animation) => animation.id.startsWith("opening-v2-"))).toBe(false);
    expect(promoted.animationStates.some((state) => state.id.startsWith("opening-v2-"))).toBe(false);
    expect(promoteApprovedOpeningV3(promoted)).toEqual(promoted);

    const v2 = promoteApprovedOpeningV2(promoted);
    const migrated = promoteApprovedOpeningV3(v2);
    expect(migrated.rooms.find((room) => room.name === "abertura").backgroundAssetName)
      .toBe(v2.rooms.find((room) => room.name === "abertura").backgroundAssetName);
    expect(migrated.actors.filter((actor) => actor.roomName === "abertura"))
      .toEqual(promoted.actors.filter((actor) => actor.roomName === "abertura"));
    expect(migrated.assets.filter((asset) => asset.id.startsWith("opening-v3-")))
      .toEqual(promoted.assets.filter((asset) => asset.id.startsWith("opening-v3-")));
    expect(migrated.animations.filter((animation) => animation.id.startsWith("opening-v3-")))
      .toEqual(promoted.animations.filter((animation) => animation.id.startsWith("opening-v3-")));
  });
});
