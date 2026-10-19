import { readFileSync } from "node:fs";
import { expandCompactSequence } from "./exemplo-template-audit.mjs";

const canonical = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
const approved = canonical.rooms.find(room => room.name === "porto_lumen");
const asset = canonical.assets.find(asset => asset.name === approved.backgroundAssetName);
const positions = new Map(canonical.actors.filter(actor => actor.roomName === "porto_lumen").map(actor => [actor.id, actor]));
const triggers = new Map(canonical.triggers.filter(trigger => trigger.roomName === "porto_lumen").map(trigger => [trigger.id, trigger]));
const companionAssets = canonical.assets.filter(asset => asset.id.startsWith("porto-approved-") || asset.id === "porto-hud-b-font");

// Regeneration must keep the approved visual surface and its authored ground
// together. Other rooms, scripts and sprite drawings retain their input data.
export function promoteApprovedPortoLumenPaged(project) {
  const result = structuredClone(project);
  const update = room => {
    if (room.name !== "porto_lumen") return room;
    for (const key of ["width", "height", "backgroundAssetName", "backgroundRenderMode", "gbStudioUseBackgroundLayout", "cameraMode", "cameraBounds", "cameraZoom", "hudPresetId"]) room[key] = structuredClone(approved[key]);
    delete room.tilesetAssetName;
    for (const key of ["tilemap", "collisions", "collisionTypes"]) room[key] = expandCompactSequence(approved[key]);
    room.tileLayers = approved.tileLayers.map(layer => ({ ...structuredClone(layer),
      tilemap: expandCompactSequence(layer.tilemap), tileSourceAssetNames: expandCompactSequence(layer.tileSourceAssetNames) }));
    room.runtime.config.profile = approved.runtime.config.profile;
    return room;
  };
  for (const key of ["scenas", "rooms"]) if (Array.isArray(result[key])) result[key] = result[key].map(update);
  if (result.scena) result.scena = update(result.scena);
  for (const actor of result.actors ?? []) {
    const source = positions.get(actor.id);
    if (source) Object.assign(actor, { x: source.x, y: source.y });
    if (source && source.spriteSheet.startsWith("porto-") && /(?:body|animations)48\.png$/.test(source.spriteSheet)) {
      actor.spriteSheet = source.spriteSheet;
      actor.animationName = source.animationName;
      if (source.animationStateID) actor.animationStateID = source.animationStateID;
      else delete actor.animationStateID;
      if (source.topdownMovement) actor.topdownMovement = structuredClone(source.topdownMovement);
    }
  }
  for (const trigger of result.triggers ?? []) {
    const source = triggers.get(trigger.id);
    if (source) for (const key of ["x", "y", "width", "height"]) trigger[key] = source[key];
  }
  for (const event of result.events ?? []) for (const step of event.steps ?? []) {
    if (step.command?.startsWith("change_scene porto_lumen ")) step.command = `change_scene porto_lumen ${event.name === "farol_sair_porto" ? "23 20" : "88 50"} down`;
  }
  for (const table of result.sceneRouteTables ?? []) {
    for (const route of [...(table.routes ?? []), table.fallback].filter(Boolean)) {
      if (route.scene === "porto_lumen") Object.assign(route, { x: 88, y: 50 });
    }
  }
  for (const connection of result.editorState?.scenaConnections ?? []) {
    if (connection.from === "porto_lumen") {
      const trigger = canonical.triggers.find(trigger => trigger.id === (connection.to === "farol_interior" ? "trigger-porto-lighthouse" : "trigger-porto-exit"));
      if (trigger) connection.exit = { x: trigger.x, y: trigger.y, width: trigger.width, height: trigger.height };
    }
    if (connection.to === "porto_lumen") Object.assign(connection.entry, {
      x: connection.from === "farol_interior" ? 23 : 88,
      y: connection.from === "farol_interior" ? 20 : 50
    });
  }
  if (!result.assets.some(candidate => candidate.name === asset.name)) {
    const index = result.assets.findIndex(candidate => candidate.id?.startsWith("penedos-v7-"));
    result.assets.splice(index < 0 ? result.assets.length : index, 0, structuredClone(asset));
  }
  if (result.editorState?.sceneMapPositions) result.editorState.sceneMapPositions.porto_lumen = structuredClone(canonical.editorState.sceneMapPositions.porto_lumen);
  for (const source of companionAssets) {
    const index = result.assets.findIndex(asset => asset.name === source.name);
    if (index < 0) {
      const firstPlatformer = result.assets.findIndex(asset => asset.id?.startsWith("penedos-v7-"));
      result.assets.splice(firstPlatformer < 0 ? result.assets.length : firstPlatformer,0,structuredClone(source));
    }
    else result.assets[index] = structuredClone(source);
  }
  for (const asset of result.assets) {
    const source = canonical.assets.find(candidate => candidate.name === asset.name);
    if (source?.metadata?.reusableLibraryAsset) asset.metadata.reusableLibraryAsset = true;
  }
  for (const source of canonical.animations.filter(animation => companionAssets.some(asset => asset.name === animation.spriteSheet))) {
    const index = result.animations.findIndex(animation => animation.id === source.id);
    if (index < 0) result.animations.push(structuredClone(source));
    else result.animations[index] = structuredClone(source);
  }
  const hud = canonical.settings.hudPresets.find(preset => preset.id === approved.hudPresetId);
  for (const source of canonical.animationStates.filter(state => companionAssets.some(asset => asset.name === state.spriteSheet))) {
    const index = result.animationStates.findIndex(state => state.id === source.id);
    if (index < 0) result.animationStates.push(structuredClone(source));
    else result.animationStates[index] = structuredClone(source);
  }
  if (hud) {
    const index = result.settings.hudPresets.findIndex(preset => preset.id === hud.id);
    if (index < 0) result.settings.hudPresets.push(structuredClone(hud));
    else result.settings.hudPresets[index] = structuredClone(hud);
  }
  for (const source of canonical.variables.filter(variable => variable.name === "porto_player_health")) {
    if (!result.variables.some(variable => variable.name === source.name)) result.variables.push(structuredClone(source));
  }
  const profile = result.events.find(event => event.name === "aplicar_perfil_jogador_base");
  if (profile && companionAssets.length) for (const step of profile.steps) {
    if (step.command.startsWith("change_player_sprite ")) step.command = `change_player_sprite ${positions.get("port-nara").spriteSheet}`;
  }
  const enter = result.events.find(event => event.name === "porto_ao_entrar");
  if (enter && companionAssets.length && !enter.steps.some(step => step.id === "porto-health-initial-state")) {
    enter.steps.splice(enter.steps.findIndex(step => step.command === "set_variable z_feature_quest_state 1")+1,0,
      structuredClone(canonical.events.find(event => event.name === enter.name).steps.find(step => step.id === "porto-health-initial-state")));
  }
  const farol = result.events.find(event => event.name === "farol_interior_ao_entrar");
  if (farol && companionAssets.length && !farol.steps.some(step => step.id === "farol-preserve-player-art")) {
    farol.steps.splice(farol.steps.findIndex(step => step.command.startsWith("play_music "))+1,0,
      ...structuredClone(canonical.events.find(event => event.name === farol.name).steps.filter(step => step.id.startsWith("farol-preserve-player-"))));
  }
  return result;
}
