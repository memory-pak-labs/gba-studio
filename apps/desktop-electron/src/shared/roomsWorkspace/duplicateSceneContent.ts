import { normalizeGBAEntityDocument } from "../../../../../packages/project-contract/src/index.js";
import type { GBAProjectData } from "../projectFile.js";
import { actorCommandReferences, sceneChangeCommand, sceneChangeCommandParts } from "../sceneChangeCommand.js";

type RecordData = Record<string, unknown>;
const record = (value: unknown): value is RecordData => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const records = (value: unknown): RecordData[] => Array.isArray(value) ? value.filter(record) : [];
const clone = <T,>(value: T): T => structuredClone(value);
const text = (value: unknown): string => typeof value === "string" ? value : "";

function visit(value: unknown, callback: (item: RecordData) => void): void {
  if (Array.isArray(value)) value.forEach(item => visit(item, callback));
  else if (record(value)) { callback(value); Object.values(value).forEach(item => visit(item, callback)); }
}

/** Copy ownership and references, leaving assets, variables and dialogue resources shared. */
export function duplicateSceneContent(data: GBAProjectData, source: RecordData, copy: RecordData, firstSceneName: string): void {
  const sourceName = text(source.name), copyName = text(copy.name), copyID = text(copy.id);
  const actors = records(data.actors), triggers = records(data.triggers), events = records(data.events), audio = records(data.audioItems), connections = records(data.connections);
  const inScene = (item: RecordData) => normalizeGBAEntityDocument(item, "actor", 0, firstSceneName).sceneName === sourceName;
  const sourceActors = actors.filter(inScene), sourceTriggers = triggers.filter(inScene);
  const occupiedIDs = new Set<string>();
  for (const collection of [actors, triggers, events, audio]) visit(collection, item => { if (text(item.id)) occupiedIDs.add(text(item.id)); });
  const newID = (id: string) => {
    const base = `${id || "item"}-copy-${copyID}`;
    let result = base, index = 2;
    while (occupiedIDs.has(result)) result = `${base}-${index++}`;
    occupiedIDs.add(result); return result;
  };
  const nameAllocator = (items: RecordData[], suffix: string) => {
    const used = new Set(items.map(item => text(item.name).toLowerCase()));
    return (name: string) => {
      const base = `${name}${suffix}`; let result = base, index = 2;
      while (used.has(result.toLowerCase())) result = `${base}${suffix === " copy" ? " " : "_"}${index++}`;
      used.add(result.toLowerCase()); return result;
    };
  };
  const actorNames = new Map<string, string>(), actorIDs = new Map<string, string>();
  const newActorName = nameAllocator(actors, " copy");
  const actorIdentity = (item: RecordData) => ({id:text(item.id) || `actor-${actors.indexOf(item) + 1}`,name:text(item.name) || `Actor ${actors.indexOf(item) + 1}`});
  sourceActors.forEach(item => {
    const identity = actorIdentity(item);
    actorNames.set(identity.name, newActorName(identity.name));
    actorIDs.set(identity.id, newID(identity.id));
  });
  const eventByName = new Map(events.map(item => [text(item.name), item]));
  const eventNames = new Map<string, string>(), eventIDs = new Map<string, string>();
  const copiedEventIDs = new Map<string, string>();
  const newEventName = nameAllocator(events, "_copy");
  const pending = events.filter(item => [item.roomName, item.sceneName].includes(sourceName)).map(item => text(item.name));
  const calledEvent = (command: string): { verb: string; name: string } | null => {
    const match = /^\s*(call_event|call_procedure)\s+(.+?)\s*$/.exec(command);
    if (!match) return null;
    let name = match[2]!;
    try { if (name.startsWith('"')) name = JSON.parse(name); } catch { /* Keep validation of malformed commands in the compiler. */ }
    return { verb: match[1]!, name };
  };
  const collectEvents = (value: unknown) => visit(value, item => {
    for (const [key, field] of Object.entries(item)) {
      if ((key === "eventName" || key.endsWith("EventName")) && text(field)) pending.push(text(field));
      if (key === "eventBindings" && record(field)) Object.values(field).forEach(name => { if (text(name)) pending.push(text(name)); });
      if (key === "command" && typeof field === "string") { const call = calledEvent(field); if (call) pending.push(call.name); }
    }
  });
  collectEvents([source, sourceActors, sourceTriggers, connections.filter(item => item.from === sourceName)]);
  while (pending.length) {
    const name = pending.shift()!, event = eventByName.get(name);
    if (!event || eventNames.has(name)) continue;
    eventNames.set(name, newEventName(name.replace(/[^a-zA-Z0-9_-]/g, "_") || "event"));
    const id = newID(text(event.id) || "event");
    copiedEventIDs.set(name, id);
    if (text(event.id)) eventIDs.set(text(event.id), id);
    collectEvents(event);
  }
  const actorReference = (value: string) => actorIDs.get(value) ?? actorNames.get(value) ?? value;
  const eventReference = (value: string) => eventNames.get(value) ?? eventIDs.get(value) ?? value;
  const actorTokens = [...actors.flatMap(item => [text(item.id), text(item.name)])].filter(Boolean);
  const rewriteCommand = (command: string): string => {
    const call = calledEvent(command);
    if (call && eventNames.has(call.name)) return `${call.verb} ${eventNames.get(call.name)}`;
    const references = actorCommandReferences(command, actorTokens);
    const parts = sceneChangeCommandParts(command, actorTokens);
    let changed = false;
    references.forEach((value, index) => {
      const next = actorReference(value); if (next !== value) { parts[index + 1] = next; changed = true; }
    });
    if (parts[0] === "change_scene" && [sourceName, text(source.id)].includes(parts[1]!)) { parts[1] = copyName; changed = true; }
    return changed ? sceneChangeCommand(parts) : command;
  };
  const rewrite = (value: unknown) => visit(value, item => {
    for (const [key, field] of Object.entries(item)) {
      if (key === "command" && typeof field === "string") item[key] = rewriteCommand(field);
      else if (key === "eventBindings" && record(field)) item[key] = Object.fromEntries(Object.entries(field).map(([binding, name]) => [binding, typeof name === "string" ? eventReference(name) : name]));
      else if (typeof field === "string") {
        if (key === "eventName" || key.endsWith("EventName")) item[key] = eventReference(field);
        else if (/^(?:actor|otherActor|targetActor|sourceActor|ownerActor|playerActor)(?:Id|ID|Name)?$/.test(key)) item[key] = actorReference(field);
        else if (["roomId", "roomID", "sceneId", "sceneID", "targetSceneId"].includes(key) && field === text(source.id)) item[key] = copyID;
        else if (["roomName", "sceneName", "targetScene", "targetSceneName", "targetRoomName", "from", "to"].includes(key) && field === sourceName) item[key] = copyName;
      }
    }
  });
  const own = (item: RecordData) => {
    item.roomName = copyName;
    for (const key of ["sceneName", "scenaName", "room", "scene"]) if (key in item) item[key] = copyName;
  };
  const copiedActors = sourceActors.map(item => {
    const identity = actorIdentity(item);
    const result = clone(item); result.id = actorIDs.get(identity.id); result.name = actorNames.get(identity.name);
    own(result); rewrite(result); return result;
  });
  const newTriggerName = nameAllocator(triggers, " copy");
  const copiedTriggers = sourceTriggers.map(item => {
    const result = clone(item); result.id = newID(text(item.id)); result.name = newTriggerName(text(item.name) || "Trigger"); own(result); rewrite(result); return result;
  });
  const copiedEvents = events.filter(item => eventNames.has(text(item.name))).map(item => {
    const result = clone(item); result.id = copiedEventIDs.get(text(item.name)); result.name = eventNames.get(text(item.name)); own(result);
    visit(result.steps, step => { if (text(step.id)) step.id = newID(text(step.id)); });
    rewrite(result); return result;
  });
  rewrite(copy);
  if (copiedActors.length) data.actors = [...actors, ...copiedActors];
  if (copiedTriggers.length) data.triggers = [...triggers, ...copiedTriggers];
  if (copiedEvents.length) data.events = [...events, ...copiedEvents];
  const copiedConnections = connections.filter(item => item.from === sourceName).map(item => {
    const result = clone(item); if (text(item.id)) result.id = newID(text(item.id)); rewrite(result); return result;
  });
  if (copiedConnections.length) data.connections = [...connections, ...copiedConnections];
  const newAudioName = nameAllocator(audio, " copy");
  const copiedAudio = audio.filter(item => item.assignedScene === sourceName).map(item => ({...clone(item),id:newID(text(item.id)),name:newAudioName(text(item.name) || "Audio"),assignedScene:copyName}));
  if (copiedAudio.length) data.audioItems = [...audio, ...copiedAudio];
}
