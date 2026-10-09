import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { promoteExemploGBAAudio } from "./exemplo-gba-audio.mjs";

describe("Exemplo GBA audio content", () => {
  it("uses tonal wave bass instead of continuous noise percussion in every music track", () => {
    const project = promoteExemploGBAAudio({ assets: [], audioItems: [], events: [], rooms: [], dialogues: [] });
    const music = project.audioItems.filter((item) => item.kind === "Musica");

    expect(music.length).toBeGreaterThan(0);
    for (const track of music) {
      const channels = track.patterns.flatMap((pattern) => pattern.channels);
      expect(channels.some((channel) => channel.type === "wave"), track.name).toBe(true);
      expect(channels.some((channel) => channel.type === "noise"), track.name).toBe(false);
    }

    const impactSfx = project.audioItems.find((item) => item.name === "farol_sfx_impacto")
      ?? project.audioItems.find((item) => item.name.includes("impact"));
    expect(impactSfx).toBeDefined();
    expect(impactSfx?.patterns[0].channels[0].type).toBe("noise");
  });

  it("preserves tactical audio supplied by the project without a candidate manifest", () => {
    const tactical = { id: "tactical-cursor", name: "farol_sfx_tatica_cursor", kind: "SFX", patterns: [] };
    const source = { assets: [], audioItems: [tactical], events: [], rooms: [], dialogues: [] };
    const project = promoteExemploGBAAudio(source);

    expect(project.audioItems).toContainEqual(tactical);
    expect(source.audioItems).toEqual([tactical]);
    expect(project.audioItems.find((item) => item.name === tactical.name)).not.toBe(tactical);
  });

  it("connects the authored audio to rooms, dialogues and gameplay events", () => {
    const project = promoteExemploGBAAudio({
      assets: [],
      audioItems: [],
      events: [
        { id: "event-1", name: "abertura_concluir", steps: [] }
      ],
      rooms: [{ name: "titulo" }],
      dialogues: [{ key: "intro" }]
    });

    expect(project.rooms).toEqual([{ name: "titulo", music: "farol_tema_principal" }]);
    expect(project.dialogues[0]).toMatchObject({
      textSound: "farol_sfx_texto",
      confirmSound: "farol_sfx_dialogo"
    });
    expect(project.events[0].steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "play_sfx farol_sfx_confirmar" })
    ]));
  });

  it("starts the opening theme from the cutscene entry event", () => {
    const project = promoteExemploGBAAudio({
      assets: [],
      audioItems: [],
      events: [
        { id: "opening-enter", name: "abertura_ao_entrar", steps: [] },
        { id: "title-enter", name: "titulo_ao_entrar", steps: [] }
      ],
      rooms: [{ name: "abertura" }],
      scenas: [{ name: "abertura" }],
      dialogues: []
    });

    expect(project.rooms[0]).toMatchObject({ music: "farol_tema_principal" });
    expect(project.scenas[0]).toMatchObject({ music: "farol_tema_principal" });
    expect(project.events.find((event) => event.name === "abertura_ao_entrar")?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "play_music farol_tema_principal" })
    ]));
    expect(project.events.find((event) => event.name === "titulo_ao_entrar")?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "play_music farol_tema_principal" })
    ]));
  });

  it("preserves the complete tactical audio catalog required by the arena capability", () => {
    const current = JSON.parse(readFileSync(new URL(
      "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
      import.meta.url
    ), "utf8"));
    const project = promoteExemploGBAAudio(current);
    const tacticalNames = [
      "farol_arena_tatica",
      "farol_sfx_tatica_cursor",
      "farol_sfx_tatica_selecionar",
      "farol_sfx_tatica_cancelar",
      "farol_sfx_tatica_mover",
      "farol_sfx_tatica_ataque",
      "farol_sfx_tatica_impacto",
      "farol_sfx_tatica_turno",
      "farol_sfx_tatica_vitoria",
      "farol_sfx_tatica_derrota"
    ];
    const audioByName = new Map(project.audioItems.map((item) => [item.name, item]));

    expect(tacticalNames.every((name) => audioByName.has(name))).toBe(true);
    const tacticalMusic = audioByName.get("farol_arena_tatica");
    expect(tacticalMusic?.patterns.flatMap((pattern) => pattern.channels).some((channel) => channel.type === "noise")).toBe(true);
    expect(audioByName.get("farol_arena_tatica")).toMatchObject({
      kind: "Musica",
      format: "COMPOSED",
      loops: true,
      bpm: 112,
      volume: 82
    });
    expect(audioByName.get("farol_sfx_tatica_cursor")).toMatchObject({
      kind: "SFX",
      format: "COMPOSED",
      loops: false,
      bpm: 180,
      volume: 78
    });
  });
});
