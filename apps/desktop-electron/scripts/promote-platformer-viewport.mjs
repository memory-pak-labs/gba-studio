import { readFileSync } from 'node:fs';
const approved = JSON.parse(readFileSync(new URL('./platformer-viewport-v13.json', import.meta.url), 'utf8'));
const sceneName = 'penedos_vento';

// Restore the explicitly approved viewport room after campaign materialization.
// Other rooms and their entities remain authored by their own promoters.
export function promotePlatformerViewport(project) {
  const next = structuredClone(project);
  if (!(next.scenas ?? next.rooms ?? []).some(s => s.name === sceneName)) return next;
  const update = s => s.name === sceneName ? structuredClone(approved.scene) : s;
  for (const key of ['rooms', 'scenas', 'scenes']) if (Array.isArray(next[key])) next[key] = next[key].map(update);
  if (next.scena) next.scena = update(next.scena);
  for (const key of ['actors', 'triggers', 'events']) {
    next[key] = [...(next[key] ?? []).filter(v => v.roomName !== sceneName), ...structuredClone(approved[key])];
  }
  const dialogueNames = new Set(approved.dialogues.map(d => d.key));
  next.dialogues = [...(next.dialogues ?? []).filter(d => !dialogueNames.has(d.key)), ...structuredClone(approved.dialogues)];
  const assetNames = new Set(approved.assets.map(a => a.name));
  const assetIds = new Set(approved.assets.map(a => a.id));
  next.assets = [...(next.assets ?? []).filter(a => !assetNames.has(a.name) && !assetIds.has(a.id)
    && !/^penedos-(?:v7-|platformer-v[78]\.png)/.test(a.name)), ...structuredClone(approved.assets)];
  for (const key of ['animations', 'animationStates']) {
    const ids = new Set(approved[key].map(v => v.id));
    next[key] = [...(next[key] ?? []).filter(v => !ids.has(v.id) && !/^penedos-v7-/.test(v.spriteSheet)), ...structuredClone(approved[key])];
  }
  for (const e of next.events) for (const s of e.steps ?? []) {
    if (/^change_scene penedos_vento(?:\s|$)/.test(s.command ?? '')) s.command = 'change_scene penedos_vento 6 11 right';
  }
  for (const table of next.sceneRouteTables ?? []) for (const route of table.routes ?? []) {
    if (route.scene === sceneName) Object.assign(route, {x:6, y:11, direction:'right'});
  }
  for (const c of next.editorState?.scenaConnections ?? []) {
    if (c.from === sceneName && c.eventName === 'penedos_retornar_armazem') c.exit = {x:28,y:10,width:2,height:2};
    if (c.to === sceneName) c.entry = {...c.entry,x:6,y:11};
  }
  return next;
}
