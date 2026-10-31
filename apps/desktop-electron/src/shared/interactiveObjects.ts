import type { GBAProjectData } from "./projectFile.js";
import { roomMapStates } from "./mapStates.js";

export const interactiveObjectKinds = ["door", "lever", "chest", "breakable", "conditional-passage", "activated-platform", "mission"] as const;
export interface InteractiveObjectParameters {
  kind: typeof interactiveObjectKinds[number];
  variable: string;
  mapStateID?: string;
  activeVariant?: string;
  inactiveVariant?: string;
  requiredItem?: string;
  rewardItem?: string;
  quantity?: number;
  sound?: string;
  targetX?: number;
  targetY?: number;
  completionValue?: number;
}
const records = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : [];
/** Authoring recipe only: output uses the same event compiler and saved variables as hand-authored scripts. */
export function configureInteractiveObject(data: GBAProjectData, actorID: string, parameters: InteractiveObjectParameters) {
  const next = structuredClone(data);
  const rooms = records(next.scenas).length ? records(next.scenas) : records(next.rooms);
  next.rooms = rooms; next.scenas = rooms;
  const actor = records(next.actors).find(item => item.id === actorID);
  if (!actor) throw new Error("Ator do objeto inexistente.");
  const room = records(next.rooms).find(item => item.id === actor.roomID || item.name === actor.roomName);
  if (!room || !["topdown", "platformer"].includes(String(room.sceneType ?? room.type ?? "topdown"))) throw new Error("Objeto requer cena Topdown ou Platformer.");
  if (actor.isPlayer === true || room.playerActorName === actor.name) throw new Error("Selecione um NPC da cena para criar o objeto interativo.");
  const p = { ...parameters };
  if (!interactiveObjectKinds.includes(p.kind) || !/^[\w.-]+$/.test(p.variable)) throw new Error("Tipo ou variável do objeto inválido.");
  for (const value of [p.requiredItem, p.rewardItem, p.sound]) if (value && /\s/.test(value)) throw new Error("Referências do objeto devem usar IDs sem espaços.");
  const quantity = p.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Quantidade deve estar entre 1 e 99.");
  const stem = `object-${actorID.replace(/[^\w.-]/g, "_")}`;
  const eventName = `${stem}-interact`, restoreName = `${stem}-restore`;
  const actions: string[] = [], restored: string[] = [];
  const mapKind = ["door", "lever", "conditional-passage"].includes(p.kind);
  if (mapKind) {
    const definition = roomMapStates(room).find(item => item.id === p.mapStateID);
    if (!definition) throw new Error("Selecione um estado de mapa da mesma cena.");
    const active = definition.variants.find(item => item.id === p.activeVariant) ?? definition.variants.find(item => item.value !== 0);
    const inactive = definition.variants.find(item => item.id === p.inactiveVariant) ?? definition.variants.find(item => item.value === 0);
    if (!active || !inactive || active.id === inactive.id) throw new Error("Variantes de mapa inválidas.");
    if (p.kind === "conditional-passage") actions.push(`set_map_state ${definition.id} ${active.id}`);
    else actions.push(`if_variable ${definition.variable} ${inactive.value}`, `set_map_state ${definition.id} ${active.id}`, "else", `set_map_state ${definition.id} ${inactive.id}`, "condition_end");
  } else if (p.kind === "activated-platform") {
    if (![p.targetX, p.targetY].every(value => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4095)) throw new Error("Destino da plataforma inválido.");
    actions.push(`set_actor_position ${actorID} ${p.targetX} ${p.targetY}`);
    restored.push(`set_actor_position ${actorID} ${p.targetX} ${p.targetY}`);
  } else if (p.kind === "mission") {
    if (!Number.isInteger(p.completionValue ?? 1) || (p.completionValue ?? 1) < 1 || (p.completionValue ?? 1) > 32767) throw new Error("Valor da missão inválido.");
  } else {
    if (p.kind === "chest" && !p.rewardItem) throw new Error("Selecione o item do baú.");
    if (p.rewardItem) actions.push(`add_item ${p.rewardItem} ${quantity}`);
    actions.push(`set_actor_visible ${actorID} false`, `set_actor_collision_enabled ${actorID} false`);
    restored.push(`set_actor_visible ${actorID} false`, `set_actor_collision_enabled ${actorID} false`);
  }
  if (p.sound) actions.push(`play_sfx ${p.sound}`);
  if (!mapKind) actions.push(`set_variable ${p.variable} ${p.completionValue ?? 1}`);
  const guarded = p.requiredItem ? [`has_item ${p.requiredItem} 1`, ...actions, "condition_end"] : actions;
  const commands = mapKind ? guarded : [`if_variable_less_than ${p.variable} 1`, ...guarded, "condition_end"];
  const restore = restored.length ? [`if_variable ${p.variable} ${p.completionValue ?? 1}`, ...restored, "condition_end"] : ["noop"];
  const events = records(next.events).filter(event => ![eventName, restoreName].includes(String(event.name)));
  const makeEvent = (name: string, list: string[]) => ({ id: name, name, category: "Objeto", roomName: room.name, steps: list.map((command, index) => ({ id: `${name}-${index}`, command })) });
  events.push(makeEvent(eventName, commands), makeEvent(restoreName, restore));
  actor.eventBindings = { ...actor.eventBindings as object, onInteract: eventName };
  actor.interactiveObject = p;
  if (actor.prefabID) actor.prefabOverrides = { ...actor.prefabOverrides as object, eventBindings: actor.eventBindings, interactiveObject: p };
  const bindRestore = (binding: "onInit" | "onRestore") => {
    const bindings = room.eventBindings as Record<string, unknown> ?? {};
    const wrapperName = `objects-${room.id}-${binding}`;
    const existing = events.find(event => event.name === wrapperName);
    const original = bindings[binding];
    const list = existing ? records(existing.steps).map(step => String(step.command)) : typeof original === "string" && original ? [`call_event ${original}`] : [];
    if (!list.includes(`call_event ${restoreName}`)) list.push(`call_event ${restoreName}`);
    const wrapper = makeEvent(wrapperName, list);
    if (existing) Object.assign(existing, wrapper); else events.push(wrapper);
    room.eventBindings = { ...bindings, [binding]: wrapperName };
  };
  bindRestore("onInit"); bindRestore("onRestore");
  room.restorePolicy = "restore-only";
  next.events = events;
  return { data: next, eventName, restoreName, cost: { commands: commands.length + restore.length, savedVariables: mapKind ? 0 : 1, actorQueueEntries: restored.length } };
}
