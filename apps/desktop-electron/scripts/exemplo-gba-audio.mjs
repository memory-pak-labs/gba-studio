import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const musicSpecs = [
  ["Rulz_BattleTheme.uge", "farol_tema_principal", 160, 90, [
    ["Ataque", "D5 . A5 . F5 . G5 . A5 . F5 . E5 . D5 .", "B4 . F4 . D4 . C4 . A4 . B4 . C4 . B3 .", "C2 . C2 . C2 . C2 . C4 . C2 . C4 . C2 ."],
    ["Confronto", "F5 . A5 . B5 . A5 . C6 . A5 . G5 . F5 .", "E4 . G4 . C4 . D4 . B3 . G3 . C3 . B3 .", "C2 . C2 . C3 . C2 . C2 . C3 . C4 . C3 ."]
  ], [0, 0, 1, 0]],
  ["Rulz_FastPaceSpeedRace.uge", "farol_enseada", 184, 86, [
    ["Largada", "E5 . G5 . A5 . B5 . F5 . A5 . G5 . E5 .", "C4 . E4 . G4 . C5 . B4 . E4 . D4 . C4 .", "C2 . C2 . C2 . C2 . C2 . C2 . C2 . C2 ."],
    ["Curva final", "D5 . F5 . A5 . G5 . F5 . D5 . E5 . C5 .", "G3 . B3 . D4 . B4 . D4 . G3 . B3 . A3 .", "C2 . C2 . C2 . C2 . C2 . C2 . C2 . C2 ."]
  ], [0, 1, 0, 1]],
  ["Rulz_GonaSpace.uge", "farol_falesias", 96, 78, [
    ["Órbita", "A4 . B4 . A4 . G4 . F4 . E4 . D4 . C4 .", "A3 . C4 . F3 . E3 . D3 . C3 . B2 . A2 .", "C2 . C3 . C2 . C3 . C2 . C3 . C2 . C3 ."],
    ["Nebulosa", "G4 . A4 . B4 . A4 . G4 . F4 . E4 . D4 .", "E3 . G3 . A3 . C4 . B3 . A3 . G3 . E3 .", "C2 . C3 . C2 . C3 . C2 . C3 . C2 . C3 ."]
  ], [0, 0, 1, 0]],
  ["Rulz_Intro.uge", "farol_tempestade", 168, 92, [
    ["Boas-vindas", "C5 . E5 . G5 . A5 . C6 . A5 . G5 . E5 .", "C4 . G3 . A3 . F4 . E4 . D4 . C4 . B3 .", "C2 . C2 . C4 . C2 . C3 . C2 . C3 . C2 ."],
    ["Aventura", "E5 . G5 . A5 . G5 . E5 . D5 . F5 . A5 .", "A3 . E4 . F3 . C4 . G3 . D4 . G3 . C4 .", "C2 . C2 . C4 . C2 . C3 . C2 . C5 . C2 ."]
  ], [0, 0, 1, 0]],
  ["Rulz_SpaceEmergency.uge", "farol_memorias", 112, 80, [
    ["Alarme", "C5 . C5 . G5 . F5 . E5 . D5 . C5 . B4 .", "C4 . G3 . D4 . A3 . G3 . F3 . E3 . D3 .", "C2 . C2 . C2 . C2 . C2 . C2 . C2 . C2 ."],
    ["Evacuação", "G5 . F5 . D5 . C5 . F5 . G5 . G5 . F5 .", "F3 . C4 . G3 . D4 . G3 . D4 . G3 . C4 .", "C2 . C2 . C2 . C2 . C2 . C2 . C2 . C2 ."]
  ], [0, 1, 0, 1]],
  ["Rulz_UndergroundCave.uge", "farol_subsolo", 94, 72, [
    ["Caverna", "E4 . G4 . B4 . A4 . G4 . F4 . E4 . D4 .", "E3 . B2 . D3 . C3 . B2 . G2 . F2 . E2 .", "C2 . C2 . C2 . C2 . C2 . C2 . C2 . C2 ."],
    ["Profundezas", "B4 . D5 . E5 . G5 . F5 . D5 . B4 . A4 .", "C3 . G2 . D3 . A2 . E3 . B2 . A2 . B2 .", "C2 . C2 . C2 . C2 . C2 . C2 . C2 . C2 ."]
  ], [0, 0, 1, 0]],
  ["Rulz_Pause_Underground.uge", "farol_corrida_final", 84, 74, [
    ["Eco baixo", "D4 . F4 . G4 . F4 . E4 . D4 . C4 . B4 .", "D3 . A3 . D3 . C3 . B2 . C3 . A2 . G2 .", "C2 . C2 . C2 . C2 . C2 . C3 . C2 . C3 ."],
    ["Gotas", "F4 . A4 . D5 . C5 . A4 . F4 . E4 . D4 .", "B2 . F3 . C3 . G3 . D3 . A3 . A2 . D3 .", "C2 . C2 . C4 . C2 . C3 . C2 . C4 . C3 ."]
  ], [0, 0, 1, 0]]
];

const sourceAudioNames = new Set([
  ...musicSpecs.map(([sourceName]) => sourceName),
  "Tronimal_Sound_Effects.sav"
]);

function phrase(value) {
  const result = value.trim().split(/\s+/).map((note) => note === "." ? "" : note);
  if (result.length !== 16) throw new Error(`Frase precisa ter 16 passos, recebeu ${result.length}: ${value}`);
  return result;
}

function tonalBassPhrase(value) {
  const bassNotes = new Map([
    ["C2", "C2"],
    ["C3", "D2"],
    ["C4", "E2"],
    ["C5", "G2"]
  ]);
  return phrase(value).map((note) => bassNotes.get(note) ?? note);
}

function channel(patternID, type, notes, name, instrument, envelope) {
  return {
    id: `${patternID}-${type}`,
    name,
    type,
    instrument,
    envelope,
    notes
  };
}

function composedMusic([, name, bpm, volume, sections, order]) {
  const patternIDs = sections.map((_, index) => `${name}-section-${index + 1}`);
  return {
    id: `gba-audio-${name}`,
    name,
    kind: "Musica",
    format: "COMPOSED",
    exportID: name,
    loops: true,
    bpm,
    volume,
    patterns: sections.map(([sectionName, lead, harmony, drums], index) => ({
      id: patternIDs[index],
      name: sectionName,
      steps: 16,
      channels: [
        channel(patternIDs[index], "pulse1", phrase(lead), "Melodia", "Pulse Lead", "Soft ADSR"),
        channel(patternIDs[index], "pulse2", phrase(harmony), "Harmonia", "Pulse Warm", "Soft ADSR"),
        channel(patternIDs[index], "wave", tonalBassPhrase(drums), "Baixo", "Wave Bass", "Soft ADSR")
      ]
    })),
    patternOrder: order.map((index) => patternIDs[index])
  };
}

function composedSoundEffect(name, label, type, notes, volume = 90) {
  const patternID = `${name}-main`;
  return {
    id: `gba-audio-${name}`,
    name,
    kind: "SFX",
    format: "COMPOSED",
    exportID: name,
    loops: false,
    bpm: 240,
    volume,
    patterns: [{
      id: patternID,
      name: label,
      steps: notes.length,
      channels: [channel(patternID, type, notes, label, type === "noise" ? "Noise Kit" : "Pulse Lead", "Short Decay")]
    }],
    patternOrder: [patternID]
  };
}

const soundEffects = [
  composedSoundEffect("farol_sfx_texto", "Texto", "pulse1", [
    "C5", "", "E5", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
  ], 80),
  composedSoundEffect("farol_sfx_dialogo", "Dialogo", "pulse1", [
    "G5", "", "A5", "", "B5", "", "", "", "", "", "", "", "", "", "", ""
  ], 74),
  composedSoundEffect("farol_sfx_cursor", "Cursor", "pulse1", [
    "C4", "", "D4", "", "E4", "", "", "", "", "", "", "", "", "", "", ""
  ], 72),
  composedSoundEffect("farol_sfx_confirmar", "Confirmar", "pulse1", [
    "D4", "", "F4", "", "A4", "", "D5", "", "", "", "", "", "", "", "", "", ""
  ], 84),
  composedSoundEffect("farol_sfx_salto", "Salto", "pulse1", [
    "E5", "", "G5", "", "C6", "", "", "", "", "", "", "", "", "", "", ""
  ], 80),
  composedSoundEffect("farol_sfx_impacto", "Impacto", "noise", [
    "C2", "", "", "C3", "", "", "", "", "", "", "", "", "", "", "", ""
  ], 88),
  composedSoundEffect("farol_sfx_item", "Item", "pulse2", [
    "E4", "", "G4", "", "C5", "", "E5", "", "C5", "", "", "", "", "", "", ""
  ], 82),
  composedSoundEffect("farol_sfx_sinal", "Sinal", "pulse1", [
    "F4", "", "A4", "", "C5", "", "A5", "", "F5", "", "", "", "", "", "", "", ""
  ], 84),
  composedSoundEffect("farol_sfx_porta", "Porta", "pulse1", [
    "C4", "", "C4", "", "D4", "", "E4", "", "D4", "", "C4", "", "", "", "", "", ""
  ], 78),
  composedSoundEffect("farol_sfx_motor", "Motor", "pulse2", [
    "G4", "", "E4", "", "F4", "", "G4", "", "E4", "", "D4", "", "C4", "", "", "", ""
  ], 86),
  composedSoundEffect("farol_sfx_alarme", "Alarme", "noise", [
    "C2", "", "C3", "", "C2", "", "D2", "", "C2", "", "C3", "", "C2", "", "", "", ""
  ], 86),
  composedSoundEffect("farol_sfx_vitoria", "Vitoria", "pulse1", [
    "E5", "", "D5", "", "E5", "", "G5", "", "A5", "", "G5", "", "E5", "", "", "", ""
  ], 90)
];

function replaceAudioCommand(command, replacements) {
  if (typeof command !== "string") return command;
  for (const [oldName, newName] of replacements) {
    if (command === `play_music ${oldName}`) return `play_music ${newName}`;
    if (command === `play_sfx ${oldName}`) return `play_sfx ${newName}`;
  }
  return command;
}

export function promoteExemploGBAAudio(data) {
  if ((data?.assets ?? []).some((asset) => asset?.metadata?.generatedBy === "canonical-scene-showcases-v1")) {
    return structuredClone(data);
  }
  const promoted = structuredClone(data);
  const tacticalAudioItems = Array.isArray(promoted.audioItems)
    ? promoted.audioItems.filter((audio) => (
      audio?.name === "farol_arena_tatica"
      || (typeof audio?.name === "string" && audio.name.startsWith("farol_sfx_tatica_"))
    ))
    : [];
  const replacements = new Map([
    ...musicSpecs.map(([oldName, newName]) => [oldName, newName]),
    ["Tronimal_Sound_Effects.sav", "farol_sfx_confirmar"],
    ["gb_builtin_crash", "farol_sfx_impacto"]
  ]);

  promoted.audioItems = [
    ...musicSpecs.map(composedMusic),
    ...soundEffects,
    ...tacticalAudioItems.map((audio) => structuredClone(audio))
  ];
  promoted.assets = Array.isArray(promoted.assets)
    ? promoted.assets.filter((asset) => !sourceAudioNames.has(asset?.name))
    : [];
  promoted.events = Array.isArray(promoted.events)
    ? promoted.events.map((event) => ({
      ...event,
      ...(Array.isArray(event?.steps) ? {
        steps: event.steps.map((step) => ({
          ...step,
          command: replaceAudioCommand(step?.command, replacements)
        }))
      } : {})
    }))
    : [];

  const roomMusic = new Map([
    ["abertura", "farol_tema_principal"],
    ["titulo", "farol_tema_principal"],
    ["prologo", "farol_memorias"],
    ["porto_lumen", "farol_enseada"],
    ["mercado_suspenso", "farol_falesias"],
    ["usina_submersa", "farol_subsolo"],
    ["tempestade", "farol_tema_principal"],
    ["guardiao_rele", "farol_tempestade"],
    ["circuito_final", "farol_corrida_final"]
  ]);
  promoted.rooms = Array.isArray(promoted.rooms)
    ? promoted.rooms.map((room) => {
      const roomName = typeof room?.name === "string" ? room.name : "";
      const music = roomMusic.get(roomName);
      return music ? { ...room, music } : room;
    })
    : [];
  promoted.scenas = Array.isArray(promoted.scenas)
    ? promoted.scenas.map((scene) => {
      const sceneName = typeof scene?.name === "string" ? scene.name : "";
      const music = roomMusic.get(sceneName);
      return music ? { ...scene, music } : scene;
    })
    : [];

  promoted.dialogues = Array.isArray(promoted.dialogues)
    ? promoted.dialogues.map((dialogue) => ({
      ...dialogue,
      textSound: "farol_sfx_texto",
      confirmSound: "farol_sfx_dialogo"
    }))
    : [];

  const appendEventSfx = (eventName, soundName) => {
    const event = eventByName.get(eventName);
    if (!event) return;
    const steps = Array.isArray(event.steps) ? event.steps : [];
    if (steps.some((step) => step?.command === `play_sfx ${soundName}`)) return;
    event.steps = [
      ...steps,
      {
        id: `${event.id ?? eventName}-audio-${soundName}`,
        command: `play_sfx ${soundName}`,
        isEnabled: true
      }
    ];
  };

  const eventByName = new Map(promoted.events.map((event) => [event?.name, event]));
  const appendEventMusic = (eventName, musicName) => {
    const event = eventByName.get(eventName);
    if (!event) return;
    const steps = Array.isArray(event.steps) ? event.steps : [];
    if (steps.some((step) => step?.command === `play_music ${musicName}`)) return;
    event.steps = [
      ...steps,
      {
        id: `${event.id ?? eventName}-audio-${musicName}`,
        command: `play_music ${musicName}`,
        isEnabled: true
      }
    ];
  };
  const setEventMusic = (eventName, oldName, newName) => {
    const event = eventByName.get(eventName);
    if (!event || !Array.isArray(event.steps)) return;
    event.steps = event.steps.map((step) => ({
      ...step,
      command: step?.command === `play_music ${oldName}` ? `play_music ${newName}` : step?.command
    }));
  };
  setEventMusic("scene_space_battle_on_enter", "gba_speed_race", "gba_battle_theme");
  setEventMusic("scene_path_to_sample_town_on_enter", "gba_outside", "gba_speed_race");
  setEventMusic("scene_parallax_example_on_enter", "gba_outside", "gba_into_the_woods");
  appendEventMusic("abertura_ao_entrar", "farol_tema_principal");
  appendEventMusic("titulo_ao_entrar", "farol_tema_principal");

  const setEventSfx = (eventName, newName) => {
    const event = eventByName.get(eventName);
    if (!event || !Array.isArray(event.steps)) return;
    event.steps = event.steps.map((step) => ({
      ...step,
      command: typeof step?.command === "string" && step.command.startsWith("play_sfx ")
        ? `play_sfx ${newName}`
        : step?.command
    }));
  };
  setEventSfx("actor_21_on_interact", "farol_sfx_confirmar");
  setEventSfx("actor_22_on_interact", "farol_sfx_item");
  setEventSfx("actor_23_on_interact", "farol_sfx_porta");
  setEventSfx("actor_24_on_interact", "farol_sfx_alarme");
  setEventSfx("scene_path_to_sample_town_on_enter_platform_callback_knockbackstart_afe587b3_3b29_4ae2_a159_88c29001ff2d", "farol_sfx_impacto");
  setEventSfx("scene_path_to_sample_town_on_enter_platform_callback_blankstart_3802d008_7046_4942_ad62_2e193179413b", "farol_sfx_confirmar");
  appendEventSfx("abertura_concluir", "farol_sfx_confirmar");
  appendEventSfx("prologo_partir", "farol_sfx_sinal");
  appendEventSfx("usina_coletar_celula", "farol_sfx_item");
  appendEventSfx("guardiao_vitoria", "farol_sfx_vitoria");
  appendEventSfx("circuito_concluir", "farol_sfx_vitoria");
  appendEventSfx("menu_inicial_novo_jogo", "farol_sfx_confirmar");
  appendEventSfx("menu_inicial_ao_entrar", "farol_sfx_cursor");
  appendEventSfx("tempestade_drone_disparar", "farol_sfx_salto");
  appendEventSfx("guardiao_derrota", "farol_sfx_impacto");
  appendEventSfx("mercado_abrir_atalho", "farol_sfx_porta");
  appendEventSfx("circuito_reiniciar", "farol_sfx_motor");
  appendEventSfx("arena_derrota", "farol_sfx_alarme");

  return promoted;
}

async function runCLI(paths) {
  for (const projectPath of paths) {
    const document = JSON.parse(await readFile(projectPath, "utf8"));
    delete document.data;
    const promoted = promoteExemploGBAAudio(document);
    await writeFile(projectPath, `${JSON.stringify(promoted, null, 2)}\n`, "utf8");
    for (const sourceName of sourceAudioNames) {
      const folder = sourceName === "Tronimal_Sound_Effects.sav" ? "sounds" : "music";
      await unlink(join(dirname(projectPath), "Assets", folder, sourceName)).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCLI(process.argv.slice(2));
}
