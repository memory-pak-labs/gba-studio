#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectPath = path.resolve(
  scriptDirectory,
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
);

const musicByScene = new Map([
  ["farol_prologo", "farol_tema_principal"],
  ["farol_titulo", "farol_tema_principal"],
  ["farol_enseada", "farol_enseada"],
  ["farol_falesias", "farol_falesias"],
  ["farol_oficina", "farol_enseada"],
  ["farol_tempestade", "farol_tempestade"],
  ["farol_guardiao_rele", "farol_tempestade"],
  ["farol_memorias", "farol_memorias"],
  ["farol_mapa_costa", "farol_memorias"],
  ["farol_patio", "farol_falesias"],
  ["farol_subsolo", "farol_subsolo"],
  ["farol_corrida_final", "farol_corrida_final"]
]);

const sfxByEvent = new Map([
  ["canonical_cutscene_interact", ["farol_sfx_sinal"]],
  ["canonical_menu_interact", ["farol_sfx_confirmar"]],
  ["canonical_topdown_interact", ["farol_sfx_confirmar"]],
  ["canonical_point_and_click_interact", ["farol_sfx_porta"]],
  ["canonical_shmup_interact", ["farol_sfx_impacto"]],
  ["canonical_battle_rpg_interact", ["farol_sfx_confirmar"]],
  ["canonical_visual_novel_interact", ["farol_sfx_confirmar"]],
  ["canonical_world_map_interact", ["farol_sfx_sinal"]],
  ["canonical_isometric_interact", ["farol_sfx_confirmar"]],
  ["canonical_dungeon_crawler_interact", ["farol_sfx_porta"]],
  ["canonical_racing_interact", ["farol_sfx_motor"]],
  ["canonical_menu_intro", ["farol_sfx_cursor"]],
  ["canonical_menu_start", ["farol_sfx_confirmar"]],
  ["canonical_menu_platformer", ["farol_sfx_confirmar"]],
  ["farol_falesias_on_enter_platform_callback_blankstart_3802d008_7046_4942_ad62_2e193179413b", ["farol_sfx_salto"]],
  ["farol_falesias_on_enter_platform_callback_knockbackstart_afe587b3_3b29_4ae2_a159_88c29001ff2d", ["farol_sfx_impacto"]],
  ["actor_save_point_0_on_interact", ["farol_sfx_item"]],
  ["canonical_world_map_intro", ["farol_sfx_sinal"]],
  ["canonical_point_and_click_exit", ["farol_sfx_porta"]],
  ["canonical_racing_intro", ["farol_sfx_motor"]],
  ["canonical_shmup_intro", ["farol_sfx_alarme"]],
  ["canonical_battle_rpg_exit", ["farol_sfx_vitoria"]]
]);

function channel(trackName, sectionName, type, name, instrument, envelope, notes) {
  return {
    id: `${trackName}-${sectionName}-${type}`,
    name,
    type,
    instrument,
    envelope,
    notes
  };
}

function pattern(trackName, sectionName, displayName, channels) {
  const steps = Math.max(...channels.map((item) => item.notes.length));
  if (!channels.every((item) => item.notes.length === steps)) {
    throw new Error(`Canais de ${trackName}/${sectionName} possuem comprimentos diferentes.`);
  }
  return {
    id: `${trackName}-${sectionName}`,
    name: displayName,
    steps,
    channels
  };
}

function music({ name, bpm, volume, assignedScene, sections }) {
  const patterns = sections.map((section) => pattern(name, ...section));
  return {
    id: `gba-audio-${name}`,
    name,
    kind: "Musica",
    format: "COMPOSED",
    exportID: name,
    loops: true,
    bpm,
    volume,
    assignedScene,
    patterns,
    patternOrder: [
      patterns[0].id,
      patterns[1].id,
      patterns[0].id,
      patterns[1].id
    ]
  };
}

function sfx({ name, displayName, bpm = 240, volume, type, instrument, notes }) {
  const mainPattern = pattern(name, "main", displayName, [
    channel(name, "main", type, displayName, instrument, "Short Decay", notes)
  ]);
  return {
    id: `gba-audio-${name}`,
    name,
    kind: "SFX",
    format: "COMPOSED",
    exportID: name,
    loops: false,
    bpm,
    volume,
    assignedScene: "Global",
    patterns: [mainPattern],
    patternOrder: [mainPattern.id]
  };
}

const musicItems = [
  music({
    name: "farol_tema_principal",
    bpm: 92,
    volume: 78,
    assignedScene: "farol_titulo",
    sections: [
      ["luz-distante", "Luz distante", [
        channel("farol_tema_principal", "luz-distante", "pulse1", "Motivo do farol", "Pulse Lead", "Long Pad", ["D5", "", "F5", "", "A5", "", "G5", "", "D5", "F5", "A5", "C6", "A5", "G5", "F5", ""]),
        channel("farol_tema_principal", "luz-distante", "pulse2", "Resposta", "Pulse Warm", "Soft ADSR", ["D4", "", "A3", "", "F4", "", "C4", "", "D4", "", "F4", "", "G4", "", "A4", ""]),
        channel("farol_tema_principal", "luz-distante", "wave", "Maré", "Wave Bass", "Long Pad", ["D2", "", "", "A2", "D2", "", "", "C3", "D2", "", "A2", "", "C3", "", "A2", ""]),
      ]],
      ["farol-desperta", "Farol desperta", [
        channel("farol_tema_principal", "farol-desperta", "pulse1", "Motivo elevado", "Pulse Bright", "Soft ADSR", ["F5", "G5", "A5", "", "D6", "", "C6", "A5", "G5", "A5", "F5", "D5", "F5", "G5", "A5", ""]),
        channel("farol_tema_principal", "farol-desperta", "pulse2", "Contraluz", "Pulse Warm", "Long Pad", ["A4", "", "C5", "", "D5", "", "F5", "", "C5", "", "A4", "", "C5", "", "D5", ""]),
        channel("farol_tema_principal", "farol-desperta", "wave", "Fundação", "Wave Bass", "Soft ADSR", ["F2", "", "C3", "", "D2", "", "A2", "", "C3", "", "G2", "", "D2", "", "A2", ""]),
      ]]
    ]
  }),
  music({
    name: "farol_enseada",
    bpm: 112,
    volume: 76,
    assignedScene: "farol_enseada",
    sections: [
      ["porto-vivo", "Porto vivo", [
        channel("farol_enseada", "porto-vivo", "pulse1", "Lia na enseada", "Pulse Warm", "Soft ADSR", ["G4", "B4", "D5", "C5", "B4", "", "G4", "A4", "B4", "D5", "E5", "D5", "B4", "A4", "G4", ""]),
        channel("farol_enseada", "porto-vivo", "pulse2", "Casas e cordas", "Pulse Bright", "Sharp Pluck", ["D4", "", "G4", "", "E4", "", "A4", "", "D4", "", "G4", "", "C4", "", "D4", ""]),
        channel("farol_enseada", "porto-vivo", "wave", "Baixo do cais", "Wave Bass", "Soft ADSR", ["G2", "", "D3", "", "C3", "", "D3", "", "G2", "D3", "", "E3", "C3", "", "D3", ""]),
      ]],
      ["oficina", "Oficina de Mara", [
        channel("farol_enseada", "oficina", "pulse1", "Ferramentas", "Pulse Lead", "Soft ADSR", ["D5", "F5", "A5", "G5", "E5", "D5", "B4", "G4", "A4", "B4", "D5", "E5", "D5", "B4", "A4", ""]),
        channel("farol_enseada", "oficina", "pulse2", "Engrenagens", "Pulse Warm", "Sharp Pluck", ["G4", "", "B4", "", "C5", "", "A4", "", "G4", "", "D4", "", "E4", "", "F4", ""]),
        channel("farol_enseada", "oficina", "wave", "Bancada", "Wave Organ", "Long Pad", ["G2", "", "E3", "", "C3", "", "D3", "", "G2", "", "B2", "", "C3", "D3", "G2", ""]),
      ]]
    ]
  }),
  music({
    name: "farol_falesias",
    bpm: 148,
    volume: 80,
    assignedScene: "farol_falesias",
    sections: [
      ["subida", "Subida das falésias", [
        channel("farol_falesias", "subida", "pulse1", "Passo aventureiro", "Pulse Lead", "Sharp Pluck", ["D5", "F5", "G5", "A5", "D6", "A5", "G5", "F5", "E5", "G5", "A5", "C6", "A5", "G5", "E5", ""]),
        channel("farol_falesias", "subida", "pulse2", "Vento lateral", "Pulse Bright", "Soft ADSR", ["A4", "", "D5", "", "C5", "", "G4", "", "A4", "", "E5", "", "C5", "", "A4", ""]),
        channel("farol_falesias", "subida", "wave", "Rocha", "Wave Bass", "Soft ADSR", ["D2", "A2", "", "C3", "D2", "A2", "", "C3", "D2", "A2", "", "G2", "C3", "A2", "D2", ""]),
      ]],
      ["ponte-alta", "Ponte alta", [
        channel("farol_falesias", "ponte-alta", "pulse1", "Salto de Lia", "Pulse Bright", "Soft ADSR", ["A4", "D5", "F5", "A5", "C6", "A5", "F5", "D5", "G5", "A5", "C6", "D6", "C6", "A5", "G5", ""]),
        channel("farol_falesias", "ponte-alta", "pulse2", "Eco do penhasco", "Pulse Warm", "Long Pad", ["F4", "", "A4", "", "D5", "", "C5", "", "E4", "", "G4", "", "A4", "", "C5", ""]),
        channel("farol_falesias", "ponte-alta", "wave", "Pilares", "Wave Bass", "Soft ADSR", ["F2", "", "C3", "C3", "D2", "", "A2", "A2", "G2", "", "D3", "D3", "A2", "", "E3", ""]),
      ]]
    ]
  }),
  music({
    name: "farol_tempestade",
    bpm: 176,
    volume: 84,
    assignedScene: "farol_tempestade",
    sections: [
      ["frente-fria", "Frente fria", [
        channel("farol_tempestade", "frente-fria", "pulse1", "Alarme melódico", "Pulse Bright", "Sharp Pluck", ["E5", "G5", "B5", "A5", "E6", "D6", "B5", "G5", "F#5", "A5", "B5", "D6", "B5", "A5", "F#5", ""]),
        channel("farol_tempestade", "frente-fria", "pulse2", "Corrente elétrica", "Pulse Lead", "Short Decay", ["B4", "B4", "", "D5", "E5", "", "D5", "", "B4", "B4", "", "A4", "B4", "", "D5", ""]),
        channel("farol_tempestade", "frente-fria", "wave", "Nuvem baixa", "Wave Saw", "Soft ADSR", ["E2", "E2", "B2", "", "D3", "D3", "A2", "", "E2", "B2", "E2", "B2", "D3", "A2", "B2", ""]),
      ]],
      ["contra-o-vento", "Contra o vento", [
        channel("farol_tempestade", "contra-o-vento", "pulse1", "Investida", "Pulse Lead", "Soft ADSR", ["B4", "D5", "E5", "G5", "B5", "A5", "G5", "E5", "D5", "F#5", "A5", "B5", "D6", "B5", "A5", ""]),
        channel("farol_tempestade", "contra-o-vento", "pulse2", "Resposta tensa", "Pulse Bright", "Sharp Pluck", ["G4", "", "B4", "B4", "A4", "", "D5", "D5", "F#4", "", "A4", "A4", "B4", "", "D5", ""]),
        channel("farol_tempestade", "contra-o-vento", "wave", "Motor sob carga", "Wave Bass", "Short Decay", ["G2", "G2", "D3", "D3", "A2", "A2", "E3", "E3", "B2", "B2", "F#3", "F#3", "E2", "B2", "E3", ""]),
      ]]
    ]
  }),
  music({
    name: "farol_memorias",
    bpm: 84,
    volume: 72,
    assignedScene: "farol_memorias",
    sections: [
      ["cartas-antigas", "Cartas antigas", [
        channel("farol_memorias", "cartas-antigas", "pulse1", "Memória de Lia", "Pulse Warm", "Long Pad", ["A4", "", "C5", "", "E5", "", "D5", "", "A4", "C5", "E5", "G5", "E5", "D5", "C5", ""]),
        channel("farol_memorias", "cartas-antigas", "pulse2", "Voz distante", "Pulse Lead", "Soft ADSR", ["E4", "", "A4", "", "G4", "", "C5", "", "E4", "", "G4", "", "A4", "", "C5", ""]),
        channel("farol_memorias", "cartas-antigas", "wave", "Mar profundo", "Wave Organ", "Long Pad", ["A2", "", "", "E3", "A2", "", "", "G3", "F3", "", "C3", "", "E3", "", "A2", ""]),
      ]],
      ["mapa-da-costa", "Mapa da costa", [
        channel("farol_memorias", "mapa-da-costa", "pulse1", "Rota iluminada", "Pulse Bright", "Soft ADSR", ["C5", "D5", "E5", "", "A5", "", "G5", "E5", "D5", "E5", "G5", "A5", "C6", "A5", "G5", ""]),
        channel("farol_memorias", "mapa-da-costa", "pulse2", "Horizonte", "Pulse Warm", "Long Pad", ["A4", "", "C5", "", "E5", "", "D5", "", "G4", "", "B4", "", "C5", "", "E5", ""]),
        channel("farol_memorias", "mapa-da-costa", "wave", "Linha da costa", "Wave Bass", "Soft ADSR", ["C3", "", "G2", "", "A2", "", "E3", "", "F2", "", "C3", "", "G2", "", "D3", ""]),
      ]]
    ]
  }),
  music({
    name: "farol_subsolo",
    bpm: 104,
    volume: 76,
    assignedScene: "farol_subsolo",
    sections: [
      ["galeria-escura", "Galeria escura", [
        channel("farol_subsolo", "galeria-escura", "pulse1", "Refração", "Pulse Thin", "Long Pad", ["D5", "", "D#5", "", "A4", "", "G#4", "", "D5", "D#5", "A5", "", "G#5", "D#5", "D5", ""]),
        channel("farol_subsolo", "galeria-escura", "pulse2", "Eco mineral", "Pulse Warm", "Soft ADSR", ["A3", "", "D4", "", "D#4", "", "A3", "", "G#3", "", "D4", "", "D#4", "", "A3", ""]),
        channel("farol_subsolo", "galeria-escura", "wave", "Profundidade", "Wave Bass", "Long Pad", ["D2", "", "", "A2", "D#2", "", "", "A2", "D2", "", "G#2", "", "D#2", "", "A2", ""]),
      ]],
      ["lente-partida", "Lente partida", [
        channel("farol_subsolo", "lente-partida", "pulse1", "Fragmentos", "Pulse Bright", "Sharp Pluck", ["A4", "D5", "D#5", "A5", "G#5", "D#5", "D5", "A4", "D5", "G#5", "A5", "D6", "A5", "G#5", "D#5", ""]),
        channel("farol_subsolo", "lente-partida", "pulse2", "Sombra", "Pulse Thin", "Long Pad", ["D4", "", "A3", "", "D#4", "", "G#3", "", "D4", "", "A3", "", "G#3", "", "D#4", ""]),
        channel("farol_subsolo", "lente-partida", "wave", "Mecanismo antigo", "Wave Saw", "Soft ADSR", ["D2", "A2", "", "D#3", "D2", "A2", "", "G#2", "D#2", "", "A2", "D#3", "G#2", "", "A2", ""]),
      ]]
    ]
  }),
  music({
    name: "farol_corrida_final",
    bpm: 188,
    volume: 84,
    assignedScene: "farol_corrida_final",
    sections: [
      ["largada", "Largada costeira", [
        channel("farol_corrida_final", "largada", "pulse1", "Motivo em alta velocidade", "Pulse Bright", "Sharp Pluck", ["D5", "F#5", "A5", "G5", "D6", "A5", "F#5", "D5", "E5", "F#5", "A5", "B5", "A5", "F#5", "E5", ""]),
        channel("farol_corrida_final", "largada", "pulse2", "Rival", "Pulse Lead", "Short Decay", ["A4", "", "D5", "D5", "B4", "", "E5", "E5", "A4", "", "D5", "D5", "G4", "", "A4", ""]),
        channel("farol_corrida_final", "largada", "wave", "Motor da costa", "Wave Saw", "Short Decay", ["D2", "D2", "A2", "A2", "B2", "B2", "G2", "G2", "D2", "A2", "D2", "A2", "G2", "A2", "D2", ""]),
      ]],
      ["farol-a-vista", "Farol à vista", [
        channel("farol_corrida_final", "farol-a-vista", "pulse1", "Chegada luminosa", "Pulse Lead", "Soft ADSR", ["B4", "D5", "F#5", "A5", "B5", "D6", "B5", "A5", "G5", "A5", "B5", "D6", "F#6", "D6", "A5", ""]),
        channel("farol_corrida_final", "farol-a-vista", "pulse2", "Linha de chegada", "Pulse Bright", "Sharp Pluck", ["G4", "G4", "D5", "", "A4", "A4", "E5", "", "B4", "B4", "F#5", "", "A4", "D5", "F#5", ""]),
        channel("farol_corrida_final", "farol-a-vista", "wave", "Última curva", "Wave Bass", "Short Decay", ["G2", "D3", "G2", "D3", "A2", "E3", "A2", "E3", "B2", "F#3", "B2", "F#3", "D2", "A2", "D3", ""]),
      ]]
    ]
  })
];

const sfxItems = [
  sfx({ name: "farol_sfx_texto", displayName: "Texto", volume: 42, type: "pulse2", instrument: "Pulse Thin", notes: ["G5"] }),
  sfx({ name: "farol_sfx_dialogo", displayName: "Avançar diálogo", volume: 58, type: "pulse1", instrument: "Pulse Warm", notes: ["D5", "A5", ""] }),
  sfx({ name: "farol_sfx_cursor", displayName: "Mover cursor", volume: 52, type: "pulse2", instrument: "Pulse Thin", notes: ["A4", "D5"] }),
  sfx({ name: "farol_sfx_confirmar", displayName: "Confirmar", volume: 68, type: "pulse1", instrument: "Pulse Bright", notes: ["D5", "F#5", "A5", ""] }),
  sfx({ name: "farol_sfx_salto", displayName: "Salto", volume: 70, type: "pulse1", instrument: "Pulse Lead", notes: ["D4", "F4", "A4", "D5", ""] }),
  sfx({ name: "farol_sfx_impacto", displayName: "Impacto", volume: 82, type: "noise", instrument: "Noise Tight", notes: ["C2", "C3", "C2", "", "C2"] }),
  sfx({ name: "farol_sfx_item", displayName: "Item encontrado", volume: 72, type: "pulse1", instrument: "Pulse Bright", notes: ["D5", "F5", "A5", "D6", ""] }),
  sfx({ name: "farol_sfx_sinal", displayName: "Sinal do farol", bpm: 200, volume: 66, type: "wave", instrument: "Wave Organ", notes: ["D4", "", "A4", "", "D5", ""] }),
  sfx({ name: "farol_sfx_porta", displayName: "Porta da oficina", volume: 70, type: "noise", instrument: "Noise Short", notes: ["C3", "C2", "C2", "", "C3", ""] }),
  sfx({ name: "farol_sfx_motor", displayName: "Motor", bpm: 220, volume: 64, type: "wave", instrument: "Wave Saw", notes: ["D2", "D2", "F2", "D2", "A2", "D2"] }),
  sfx({ name: "farol_sfx_alarme", displayName: "Alarme", bpm: 220, volume: 74, type: "pulse1", instrument: "Pulse Bright", notes: ["A5", "E5", "A5", "E5", "A5", ""] }),
  sfx({ name: "farol_sfx_vitoria", displayName: "Vitória", bpm: 220, volume: 78, type: "pulse1", instrument: "Pulse Lead", notes: ["D5", "F#5", "A5", "D6", "A5", "D6", "F#6", ""] })
];

function isAudioCommand(command) {
  return typeof command === "string" && /^(play_music|play_sfx)\s+/.test(command.trim());
}

function audioStep(eventName, command, index) {
  const slug = command.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return {
    id: `lighthouse-audio-${eventName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index + 1}-${slug}`,
    command,
    isEnabled: true
  };
}

async function main() {
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const rooms = Array.isArray(project.rooms) ? project.rooms : [];
  const events = Array.isArray(project.events) ? project.events : [];
  const dialogues = Array.isArray(project.dialogues) ? project.dialogues : [];
  const commandsByEvent = new Map();

  for (const room of rooms) {
    const musicName = musicByScene.get(room.name);
    if (!musicName) {
      throw new Error(`Cena sem direção musical: ${room.name}`);
    }
    room.music = musicName;
    const eventName = room.onEnterEventName ?? room.eventBindings?.onInit;
    if (typeof eventName !== "string" || !eventName) {
      throw new Error(`Cena sem evento de entrada para iniciar música: ${room.name}`);
    }
    const commands = commandsByEvent.get(eventName) ?? [];
    commands.push(`play_music ${musicName}`);
    commandsByEvent.set(eventName, commands);
  }

  for (const [eventName, sfxNames] of sfxByEvent) {
    const commands = commandsByEvent.get(eventName) ?? [];
    commands.push(...sfxNames.map((name) => `play_sfx ${name}`));
    commandsByEvent.set(eventName, commands);
  }

  for (const event of events) {
    const steps = Array.isArray(event.steps) ? event.steps : [];
    const retainedSteps = steps.filter((step) => !isAudioCommand(step?.command));
    const commands = commandsByEvent.get(event.name) ?? commandsByEvent.get(event.id) ?? [];
    event.steps = [
      ...commands.map((command, index) => audioStep(event.name ?? event.id ?? "event", command, index)),
      ...retainedSteps
    ];
  }

  for (const eventName of commandsByEvent.keys()) {
    if (!events.some((event) => event.name === eventName || event.id === eventName)) {
      throw new Error(`Evento de áudio não encontrado: ${eventName}`);
    }
  }

  for (const dialogue of dialogues) {
    dialogue.textSound = "farol_sfx_texto";
    dialogue.confirmSound = "farol_sfx_dialogo";
  }

  project.audioItems = [...musicItems, ...sfxItems];
  const serializedProject = `${JSON.stringify(project, null, 2)}\n`;
  await writeFile(projectPath, serializedProject, "utf8");

  console.log(`Direção sonora aplicada em ${rooms.length} cenas.`);
  console.log(`${musicItems.length} músicas e ${sfxItems.length} SFX compostos no editor.`);
  console.log(`${dialogues.length} diálogos ligados aos novos sons de texto e confirmação.`);
}

await main();
