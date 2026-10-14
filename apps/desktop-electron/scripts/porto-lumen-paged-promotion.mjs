import { readFileSync } from "node:fs";
import { expandCompactSequence } from "./exemplo-template-audit.mjs";

const canonical = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
const approved = canonical.rooms.find(room => room.name === "porto_lumen");
const asset = canonical.assets.find(asset => asset.name === approved.backgroundAssetName);
const positions = new Map(canonical.actors.filter(actor => actor.roomName === "porto_lumen").map(actor => [actor.id, actor]));
const triggers = new Map(canonical.triggers.filter(trigger => trigger.roomName === "porto_lumen").map(trigger => [trigger.id, trigger]));

// Regeneration must keep the approved visual surface and its authored ground
// together. Other rooms, scripts and sprite drawings retain their input data.
export function promoteApprovedPortoLumenPaged(project) {
  const result = structuredClone(project);
  const update = room => {
    if (room.name !== "porto_lumen") return room;
    for (const key of ["width", "height", "backgroundAssetName", "backgroundRenderMode", "gbStudioUseBackgroundLayout", "cameraMode", "cameraBounds", "cameraZoom"]) room[key] = structuredClone(approved[key]);
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
  return result;
}
