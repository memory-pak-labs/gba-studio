import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { promoteApprovedOpeningV2, OPENING_V2_FILES } from "./opening-v2-promotion.mjs";

const projectPath = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
const readProject = () => JSON.parse(readFileSync(projectPath, "utf8"));

describe("opening-v2 promotion", () => {
  it("substitui a aeronave pelos quatro quadros aprovados sem alterar outras cenas", () => {
    const source = readProject();
    const promoted = promoteApprovedOpeningV2(source);
    const scene = promoted.rooms.find((room) => room.name === "abertura");
    const actors = promoted.actors.filter((actor) => actor.roomName === "abertura");

    expect(promoted.rooms).toHaveLength(source.rooms.length);
    expect(promoted.rooms.find((room) => room.name === "titulo"))
      .toEqual(source.rooms.find((room) => room.name === "titulo"));
    expect(scene.backgroundAssetName).toBe("opening-v2-background-240x160.png");
    expect(promoted.scenas.find((room) => room.name === "abertura")).toEqual(scene);
    expect(actors.map((actor) => actor.id)).toEqual([
      "opening-v2-actor-guardia-idle",
      "opening-v2-actor-guardia-turn",
      "opening-v2-actor-guardia-signal",
      "opening-v2-actor-menino",
      "opening-v2-actor-gaivota"
    ]);
    expect(scene.runtime.config.steps.map((step) => step.id)).toEqual([
      "opening-v2-01-vigia-na-praia",
      "opening-v2-02-vigia-de-costas",
      "opening-v2-03-sinal-ao-farol",
      "opening-v2-04-menino-na-praia",
      "opening-v2-complete"
    ]);
    expect(scene.runtime.config.steps[2].eventName).toBe("abertura_sinal");
    expect(scene.runtime.config.steps.at(-1).eventName).toBe("abertura_concluir");
    for (const [index, step] of scene.runtime.config.steps.slice(0, 4).entries()) {
      expect(step.actorMotions.map((motion) => motion.actorIndex)).toEqual([0, 1, 2, 3, 4]);
      const visible = step.actorMotions.filter((motion) => motion.toPosition.x < 240);
      expect(visible).toHaveLength(index === 3 ? 2 : 1);
    }
    expect(promoted.events.find((event) => event.name === "abertura_sinal")?.steps)
      .toEqual([{ id: "event-abertura-signal-v2-sfx", command: "play_sfx farol_sfx_sinal", isEnabled: true }]);
    expect(promoted.events.find((event) => event.name === "abertura_concluir")?.steps.map((step) => step.command))
      .toEqual(["change_scene titulo 0 0 down"]);
    expect(OPENING_V2_FILES.map((file) => file.name)).toHaveLength(6);
    for (const { name } of OPENING_V2_FILES) {
      expect(promoted.assets.some((asset) => asset.name === name)).toBe(true);
    }
    expect(promoteApprovedOpeningV2(promoted)).toEqual(promoted);
  });
});
