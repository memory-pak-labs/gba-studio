import { EXEMPLO_GB_STUDIO_SCENE_TYPES } from "./exemplo-gba-scene-types.mjs";
import { auditExemploSceneGeometry } from "./exemplo-scene-geometry-audit.mjs";

function projectArray(project, key) {
  return Array.isArray(project?.[key]) ? project[key] : [];
}

export function expandCompactSequence(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  if (value.encoding === "rle-v1") {
    if (!Number.isInteger(value.length) || !Array.isArray(value.runs)) return [];
    const expanded = [];
    for (const run of value.runs) {
      if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[1]) || run[1] <= 0) return [];
      for (let index = 0; index < run[1]; index += 1) expanded.push(run[0]);
    }
    return expanded.length === value.length ? expanded : [];
  }

  if (
    value.encoding !== "metatile-v1"
    || !Number.isInteger(value.width)
    || !Number.isInteger(value.height)
    || !Number.isInteger(value.blockWidth)
    || !Number.isInteger(value.blockHeight)
    || value.width <= 0
    || value.height <= 0
    || value.blockWidth <= 0
    || value.blockHeight <= 0
    || value.width % value.blockWidth !== 0
    || value.height % value.blockHeight !== 0
    || !Array.isArray(value.dictionary)
    || !Array.isArray(value.indices)
  ) return [];

  const blockLength = value.blockWidth * value.blockHeight;
  if (value.dictionary.some((block) => (
    !Array.isArray(block) || block.length !== blockLength
  ))) return [];

  const expectedIndices = (value.width / value.blockWidth) * (value.height / value.blockHeight);
  if (
    value.indices.length !== expectedIndices
    || value.indices.some((index) => (
      !Number.isInteger(index) || index < 0 || index >= value.dictionary.length
    ))
  ) return [];

  const expanded = Array.from({ length: value.width * value.height }, () => null);
  let mapIndex = 0;
  for (let blockY = 0; blockY < value.height; blockY += value.blockHeight) {
    for (let blockX = 0; blockX < value.width; blockX += value.blockWidth) {
      const block = value.dictionary[value.indices[mapIndex]];
      mapIndex += 1;
      for (let localY = 0; localY < value.blockHeight; localY += 1) {
        for (let localX = 0; localX < value.blockWidth; localX += 1) {
          expanded[((blockY + localY) * value.width) + blockX + localX] = (
            block[(localY * value.blockWidth) + localX]
          );
        }
      }
    }
  }
  return expanded;
}

export function auditExemploTemplate(project) {
  const issues = [];
  const scenes = projectArray(project, "scenas");
  const events = projectArray(project, "events");
  const actors = projectArray(project, "actors");
  const assets = projectArray(project, "assets");
  const dialogues = projectArray(project, "dialogues");
  const audioItems = projectArray(project, "audioItems");
  const variables = projectArray(project, "variables");
  const sceneByName = new Map(scenes.map((scene) => [scene?.name, scene]));
  const eventNames = new Set(events.map((event) => event?.name));
  const assetNames = new Set(assets.map((asset) => asset?.name));
  const audioNames = new Set(audioItems.map((audio) => audio?.name));
  const referencedAudio = new Set();
  const expectedEntries = Object.entries(EXEMPLO_GB_STUDIO_SCENE_TYPES);

  if (scenes.length !== expectedEntries.length) {
    issues.push(`Contagem scenes: ${scenes.length} em vez de ${expectedEntries.length}.`);
  }
  for (const [index, [name, sceneType]] of expectedEntries.entries()) {
    const scene = scenes[index];
    if (!scene || scene.name !== name) {
      issues.push(`Cena na posicao ${index + 1}: esperada ${name}.`);
      continue;
    }
    if (scene.sceneType !== sceneType || scene.runtime?.type !== sceneType) {
      issues.push(`Cena ${name}: runtime ${scene.runtime?.type} diverge de ${sceneType}.`);
    }
    const cellCount = Number(scene.width) * Number(scene.height);
    if (!Number.isInteger(cellCount) || cellCount <= 0) {
      issues.push(`Cena ${name}: dimensoes invalidas.`);
    } else {
      const collisions = expandCompactSequence(scene.collisions);
      const collisionTypes = expandCompactSequence(scene.collisionTypes);
      if (collisions.length > 0 && collisions.length !== cellCount) issues.push(`Cena ${name}: collisions incompleta.`);
      if (collisionTypes.length !== cellCount) issues.push(`Cena ${name}: collisionTypes incompleta.`);
      if (collisions.length === cellCount && collisionTypes.length === cellCount && collisions.some((value, index) => value !== collisionTypes[index])) {
        issues.push(`Cena ${name}: collisions e collisionTypes estao dessincronizados.`);
      }
    }
    const onInit = scene.eventBindings?.onInit ?? scene.onEnterEventName;
    if (typeof onInit !== "string" || !eventNames.has(onInit)) {
      issues.push(`Cena ${name}: evento inicial nao resolvido.`);
    }
    const supportOverlay = scene.runtime?.type === "menu" && scene.runtime?.config?.role !== "title";
    const presentationScene = scene.name === "logo" || scene.name === "abertura";
    const briefing = scene.campaign ?? scene.supportBriefing;
    if (!supportOverlay && !presentationScene && (!briefing?.objective || !briefing?.controls || !briefing?.success || !briefing?.failureRecovery)) {
      issues.push(`Cena ${name}: briefing de campanha incompleto.`);
    }
  }

  for (const event of events) {
    if (typeof event?.roomName === "string" && !sceneByName.has(event.roomName)) {
      issues.push(`Evento ${event?.name}: cena ${event.roomName} ausente.`);
    }
    for (const step of projectArray(event, "steps")) {
      const audioReference = String(step?.command ?? "").match(/^(?:play_music|play_sfx|set_text_sfx)\s+(\S+)/)?.[1];
      if (audioReference) referencedAudio.add(audioReference);
      const target = String(step?.command ?? "").match(/^change_scene\s+(\S+)/)?.[1];
      if (target && !sceneByName.has(target)) issues.push(`Evento ${event?.name}: destino ${target} ausente.`);
    }
  }

  for (const actor of actors) {
    if (!sceneByName.has(actor?.roomName)) issues.push(`Ator ${actor?.name}: cena ${actor?.roomName} ausente.`);
    if (actor?.spriteSheet && !assetNames.has(actor.spriteSheet)) issues.push(`Ator ${actor?.name}: sprite ${actor.spriteSheet} ausente.`);
  }

  for (const dialogue of dialogues) {
    if (!dialogue?.translations?.["pt-BR"] || !dialogue?.translations?.es) {
      issues.push(`Dialogo ${dialogue?.key}: traducao incompleta.`);
    }
    for (const audioReference of [dialogue.textSound, dialogue.confirmSound]) {
      if (typeof audioReference === "string" && audioReference.trim()) referencedAudio.add(audioReference.trim());
    }
  }

  for (const room of projectArray(project, "rooms")) {
    if (typeof room?.music === "string" && room.music.trim()) referencedAudio.add(room.music.trim());
  }
  for (const scene of scenes) {
    const tacticalAudio = scene?.runtime?.config?.tacticalPresentation?.audio;
    if (!tacticalAudio || typeof tacticalAudio !== "object") continue;
    if (typeof tacticalAudio.music === "string" && tacticalAudio.music.trim()) {
      referencedAudio.add(tacticalAudio.music.trim());
    }
    if (tacticalAudio.cues && typeof tacticalAudio.cues === "object") {
      for (const reference of Object.values(tacticalAudio.cues)) {
        if (typeof reference === "string" && reference.trim()) referencedAudio.add(reference.trim());
      }
    }
  }
  for (const audioReference of referencedAudio) {
    if (!audioNames.has(audioReference)) issues.push(`Audio referenciado ausente: ${audioReference}.`);
  }

  const requiredVariables = [
    "var_chapter", "var_frame", "var_energy_cell", "var_grip",
    "var_stabilizer", "var_shield", "var_boost", "var_guardian_bond",
    "var_active_route", "var_warehouse_inspected", "var_observatory_read", "var_market_shortcut", "var_relay_cleared", "var_campaign_finished",
    "var_language"
  ];
  const variableNames = new Set(variables.map((variable) => variable?.name));
  for (const name of requiredVariables) if (!variableNames.has(name)) issues.push(`Variavel de Vértice ausente: ${name}.`);

  const geometry = auditExemploSceneGeometry(project);
  issues.push(...geometry.issues);

  return {
    ok: issues.length === 0,
    counts: {
      scenes: scenes.length,
      assets: assets.length,
      actors: actors.length,
      animations: projectArray(project, "animations").length,
      dialogues: dialogues.length,
      audioItems: audioItems.length,
      referencedAudio: referencedAudio.size
    },
    geometry,
    issues
  };
}
