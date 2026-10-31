import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";
import { silenceInitialMenuMusic, integrateApprovedInitialMenuAudio } from "./initial-menu-audio.mjs";

const templateURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
const initialScenes = ["logo", "abertura", "titulo", "escolha_genero", "nome_jogador", "carregar_jogo", "configuracoes", "creditos"];

function assertQuietInitialMenu(project) {
  for (const collection of [project.rooms, project.scenas]) {
    for (const name of initialScenes) {
      expect(collection.find(scene => scene.name === name)?.music, name).toBe("");
    }
  }
  const entry = project.events.find(event => event.name === "titulo_ao_entrar");
  expect(entry.steps.map(step => step.command)).toContain("stop_music");
  expect(project.events.filter(event => initialScenes.includes(event.roomName))
    .flatMap(event => event.steps ?? []).some(step => step.command === "play_music farol_tema_principal")).toBe(false);
}

describe("quiet initial menu", () => {
  it("integrates only the five approved effects and preserves them through regeneration", () => {
    const project = JSON.parse(readFileSync(templateURL, "utf8"));
    const manifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/initial-menu-audio-approved.json", import.meta.url), "utf8"));
    const integrated = integrateApprovedInitialMenuAudio(project, manifest);
    expect(integrated).toEqual(project);
    expect(integrated.assets.filter(asset => asset.id.startsWith("initial-menu-"))).toEqual(manifest.assets);
    expect(integrated.audioItems.filter(item => item.id.startsWith("initial-menu-"))).toEqual(manifest.audioItems);
    expect(integrated.events.find(event => event.name === "titulo_abrir_menu").steps[0].command).toBe("play_sfx menu-abrir-v1.wav 65 8");
    expect(integrated.events.find(event => event.name === "titulo_novo_jogo").steps.some(step => step.command === "play_sfx farol_sfx_confirmar")).toBe(false);
    const regenerated = promoteExemploGBAVerticeCampaign(project);
    expect(regenerated.assets.filter(asset => asset.id.startsWith("initial-menu-"))).toEqual(manifest.assets);
    expect(regenerated.audioItems.filter(item => item.id.startsWith("initial-menu-"))).toEqual(manifest.audioItems);
    expect(regenerated.scenas.find(scene => scene.name === "titulo").runtime.config.screens[1].actionSounds)
      .toEqual({navigate:"menu-navegar-v1.wav",confirm:"menu-confirmar-v1.wav",back:"menu-voltar-v1.wav",unavailable:"menu-indisponivel-v1.wav"});
    expect(() => integrateApprovedInitialMenuAudio(project, { ...manifest, approval: { approved: false } })).toThrow(/approval/);
  });
  it("removes the old loop from the complete canonical opening and menu", () => {
    assertQuietInitialMenu(JSON.parse(readFileSync(templateURL, "utf8")));
  });

  it("does not restore the retired menu loop when regenerating the campaign", () => {
    const source = JSON.parse(readFileSync(templateURL, "utf8"));
    assertQuietInitialMenu(promoteExemploGBAVerticeCampaign(source));
  });

  it("preserves gameplay, other music, assets and unsaved edits and is idempotent", () => {
    const source = {
      rooms: [{ name: "titulo", music: "farol_tema_principal", custom: 42 }, { name: "porto_lumen", music: "farol_enseada" }],
      scenas: [{ name: "titulo", music: "farol_tema_principal" }, { name: "prologo", music: "farol_tema_principal" }],
      events: [
        { name: "titulo_ao_entrar", roomName: "titulo", command: "noop", steps: [{ command: "play_music farol_tema_principal" }, { command: "set_variable var_test 42" }] },
        { name: "timeline_signal_repair", roomName: "farol_interior", steps: [{ command: "play_music farol_tema_principal" }] }
      ],
      assets: [{ id: "user-work" }], audioItems: [{ name: "farol_tema_principal" }], editorState: { custom: true }
    };
    const before = structuredClone(source);
    const result = silenceInitialMenuMusic(source);
    expect(source).toEqual(before);
    expect(result.rooms[0]).toEqual({ name: "titulo", music: "", custom: 42 });
    expect(result.rooms[1]).toEqual(source.rooms[1]);
    expect(result.scenas[1]).toEqual(source.scenas[1]);
    expect(result.events[0].steps.map(step => step.command)).toEqual(["stop_music", "set_variable var_test 42"]);
    expect(result.events[1]).toEqual(source.events[1]);
    for (const key of ["assets", "audioItems", "editorState"]) expect(result[key]).toEqual(source[key]);
    expect(silenceInitialMenuMusic(result)).toEqual(result);
  });
});
