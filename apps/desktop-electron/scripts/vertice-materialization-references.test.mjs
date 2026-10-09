import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateGBAProjectMigrationContract } from "../../../packages/project-contract/src/index.ts";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

describe("Vértice materialization references", () => {
  it("preserves authored references when rebuilding an existing campaign", () => {
    const source = JSON.parse(readFileSync(templateURL, "utf8"));
    const sourceLoadRoom = source.rooms.find((room) => room.name === "carregar_jogo");
    const sourceBackground = sourceLoadRoom.backgroundAssetName;
    const promoted = promoteExemploGBAVerticeCampaign(source);
    const loadRoom = promoted.rooms.find((room) => room.name === "carregar_jogo");
    const assetNames = new Set(promoted.assets.map((asset) => asset.name));
    const eventNames = new Set(promoted.events.map((event) => event.name));

    expect(loadRoom.backgroundAssetName).toBe(sourceBackground);
    expect(assetNames.has(loadRoom.backgroundAssetName)).toBe(true);
    for (const name of ["mapa_ao_entrar", "penedos_teste_contato_inimigo", "arena_derrota"]) {
      expect(eventNames.has(name)).toBe(true);
      expect(promoted.events.find((event) => event.name === name))
        .toEqual(source.events.find((event) => event.name === name));
    }
    expect(validateGBAProjectMigrationContract(promoted)).toEqual([]);
    const promotedAgain = promoteExemploGBAVerticeCampaign(promoted);
    expect(validateGBAProjectMigrationContract(promotedAgain)).toEqual([]);
    expect(promotedAgain.events.map((event) => event.name)).toEqual(promoted.events.map((event) => event.name));
    expect(source.rooms.find((room) => room.name === "carregar_jogo")?.backgroundAssetName)
      .toBe(sourceBackground);
  });
});
