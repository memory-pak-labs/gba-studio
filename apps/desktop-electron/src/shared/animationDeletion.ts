import { authoredEventCommandRecords } from "./authoredEventCommands.js";
import type { GBAProjectData } from "./projectFile.js";
import { sceneChangeCommand, sceneChangeCommandParts } from "./sceneChangeCommand.js";
import { isSpriteAnimationType } from "./spriteAnimationState.js";
import { removeSpriteAnimationFromProject } from "./spritesWorkspace.js";

type Entry = Record<string, unknown>;
type Link = {
  label: string;
  replace?: (animation: Entry) => void;
  unlink?: () => void;
  compatible?: (animation: Entry) => boolean;
};

function object(value: unknown): Entry {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Entry : {};
}

function records(value: unknown): Entry[] {
  return Array.isArray(value) ? value.filter((item): item is Entry => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function animationID(value: Entry, index: number): string {
  return String(value.id || `animation-${index + 1}`);
}

function animationDeletion(data: GBAProjectData, id: string) {
  const animations = records(data.animations);
  const selected = animations.find((item, index) => animationID(item, index) === id);
  if (!selected) return { source: undefined, links: [], usages: [], replacements: [], canUnlink: false };
  const source = selected;
  const links: Link[] = [];
  const sourceSheet = source.spriteSheet;
  const actors = records(data.actors);
  const prefabs = records(data.actorPrefabs);
  const scenes = records(data.scenas).length ? records(data.scenas) : records(data.rooms);
  const settings = object(data.settings);
  const commandRecords = authoredEventCommandRecords(data);
  const actorNames = actors.flatMap(actor => [actor.name, actor.id]).filter((value): value is string => typeof value === "string");

  function match(value: unknown, sheets: unknown[]): "yes" | "ambiguous" | "no" {
    if (typeof value !== "string" || !value) return "no";
    const knownSheets = [...new Set(sheets.filter(Boolean))];
    if (knownSheets.length && !knownSheets.includes(sourceSheet)) return "no";
    const matches = animations.filter((item, index) => value === animationID(item, index) || value === item.name);
    const relevant = knownSheets.length ? matches.filter(item => knownSheets.includes(item.spriteSheet)) : matches;
    if (!relevant.includes(source)) return "no";
    return relevant.length === 1 && knownSheets.length <= 1 ? "yes" : "ambiguous";
  }

  function named(owner: Entry, key: string, label: string, sheets: unknown[], frameOwner?: Entry, canUnlink = true): void {
    const value = owner[key];
    const result = match(value, sheets);
    if (result === "no") return;
    if (result === "ambiguous") { links.push({ label: `${label} · vínculo ambíguo` }); return; }
    const startFrame = typeof frameOwner?.animationFrameIndex === "number" ? frameOwner.animationFrameIndex : -1;
    links.push({
      label,
      compatible: candidate => startFrame < Math.max(1, Number(candidate.frameCount) || records(candidate.frames).length),
      replace(candidate) { owner[key] = value === id && value !== source.name ? candidate.id : candidate.name; },
      ...(canUnlink ? { unlink() {
        delete owner[key];
        if (frameOwner) delete frameOwner.animationFrameIndex;
      } } : {})
    });
  }

  const states = records(data.animationStates);
  const authoredStates = states.filter(state => state.id && state.spriteSheet && isSpriteAnimationType(state.animationType) && Array.isArray(state.animationIDs));
  for (const state of states) {
    const ids = state.animationIDs;
    if (!Array.isArray(ids) || !ids.includes(id)) continue;
    const stillHasClip = ids.some(value => value !== id && animations.some((item, index) => animationID(item, index) === value));
    const stateIsUsed = [...actors, ...prefabs].some(actor => {
      if (state.id && actor.animationStateID === state.id) return true;
      if (!state.spriteSheet || actor.spriteSheet !== state.spriteSheet) return false;
      const matching = authoredStates.filter(other => other.spriteSheet === actor.spriteSheet);
      return (matching.find(other => other.id === actor.animationStateID) ?? matching[0]) === state;
    }) || commandRecords.some(owner => [owner.command, ...(typeof owner.commands === "string" ? owner.commands.split(/\r?\n/) : [])]
        .some(command => {
          if (typeof command !== "string") return false;
          const [verb, , operand] = sceneChangeCommandParts(command, actorNames);
          return verb === "set_actor_animation_state" && Boolean(operand) && (operand === state.id || operand === state.name);
        }));
    links.push({
      label: `Estado de animação: ${String(state.name ?? state.id)}${stateIsUsed && !stillHasClip ? " · precisa de uma animação" : ""}`,
      compatible: candidate => state.animationType === "fixed"
        || ((source.state ?? "") === (candidate.state ?? "") && (source.direction ?? "") === (candidate.direction ?? "")),
      replace(candidate) { state.animationIDs = [...new Set(ids.map(value => value === id ? candidate.id : value))]; },
      ...(!stateIsUsed || stillHasClip ? { unlink() { state.animationIDs = ids.filter(value => value !== id); } } : {})
    });
  }

  for (const [collection, label] of [[actors, "Ator"], [prefabs, "Pré-fabricado"]] as const) {
    for (const actor of collection) {
      const display = `${label}: ${String(actor.name ?? actor.id)}`;
      const sheets = [actor.spriteSheet];
      named(actor, "animationName", display, sheets, actor);
      named(actor, "animation", display, sheets);
      const depthSheets = Object.values(object(actor.dungeonDepthSheets));
      named(actor, "dungeonDepthAnimationName", `${display} · poses por distância`, depthSheets.length ? depthSheets : sheets);
      for (const key of ["battleAnimations", "lutaAnimations"]) {
        const mapping = object(actor[key]);
        for (const role of Object.keys(mapping)) named(mapping, role, `${display} · ${role}`, sheets);
      }
    }
  }

  for (const scene of [...records(data.scenas), ...records(data.rooms), object(data.scena), object(data.room)]) {
    const config = object(object(scene.runtime).config);
    const tactical = object(config.tacticalPresentation);
    for (const unit of records(tactical.units)) {
      const mapping = object(unit.animations);
      for (const key of Object.keys(mapping)) named(mapping, key,
        `Cena: ${String(scene.name)} · unidade ${String(unit.id ?? unit.actorId ?? "")} · ${key}`, [unit.sheet], undefined, false);
    }
  }

  const dynamicSheets = new Map<string, Set<string>>();
  for (const owner of commandRecords) {
    for (const command of [owner.command, ...(typeof owner.commands === "string" ? owner.commands.split(/\r?\n/) : [])]) {
      if (typeof command !== "string") continue;
      const [verb, target, sprite] = sceneChangeCommandParts(command, actorNames);
      const actor = verb === "change_player_sprite" ? "player" : target?.toLowerCase();
      const sheet = verb === "change_player_sprite" ? target : sprite;
      if (!actor || !sheet || !["change_player_sprite", "change_actor_sprite", "set_actor_sprite"].includes(verb ?? "")) continue;
      const references = dynamicSheets.get(actor) ?? new Set<string>();
      references.add(sheet);
      dynamicSheets.set(actor, references);
    }
  }

  function actorSheets(reference: string, event?: Entry): unknown[] {
    if (reference.toLowerCase() !== "player") {
      const actor = actors.find(item => item.id === reference || item.name === reference);
      const dynamic = [reference, actor?.id, actor?.name].flatMap(key =>
        typeof key === "string" ? [...dynamicSheets.get(key.toLowerCase()) ?? []] : []);
      return [actor?.spriteSheet, ...dynamic];
    }
    const sceneName = event?.roomName ?? event?.sceneName ?? event?.roomID;
    const scoped = sceneName ? scenes.filter(scene => scene.name === sceneName || scene.id === sceneName) : scenes;
    const candidates = scoped.flatMap(scene => {
      const playerName = scene.playerActorName ?? object(settings.general).startPlayer;
      return actors.filter(actor => (actor.name === playerName || actor.id === playerName)
        && (actor.roomName === scene.name || actor.sceneName === scene.name || actor.roomID === scene.id));
    });
    const defaults = candidates.length ? candidates.map(actor => actor.spriteSheet)
      : Object.values(object(object(settings.sceneTypes).defaultPlayerSprites));
    return [...defaults, ...dynamicSheets.get("player") ?? []];
  }

  for (const machine of records(object(data.advancedTools).actorStateMachines)) {
    const sheets = actorSheets(String(machine.actor ?? ""));
    for (const state of records(machine.states)) named(state, "animation",
      `Máquina de estados: ${String(machine.name ?? machine.id)} · ${String(state.id)}`, sheets);
  }

  const owners = new Map<Entry, Entry>();
  for (const event of records(data.events)) {
    for (const owner of [event, ...records(event.steps)]) owners.set(owner, event);
  }
  for (const owner of commandRecords) {
    for (const key of ["command", "commands"]) {
      const raw = owner[key];
      if (typeof raw !== "string") continue;
      const lines = raw.split(/(\r?\n)/);
      lines.forEach((line, index) => {
        const parts = sceneChangeCommandParts(line, actorNames);
        const [verb, actor, animation] = parts;
        if (verb !== "set_actor_animation" && verb !== "play_actor_animation") return;
        const event = owners.get(owner);
        const result = match(animation, actorSheets(actor ?? "", event));
        if (result === "no") return;
        const label = event ? `Evento: ${String(event.name ?? event.id)}` : "Evento em linha do tempo";
        if (result === "ambiguous") { links.push({ label: `${label} · vínculo ambíguo` }); return; }
        function write(command: string) { lines[index] = command; owner[key] = lines.join(""); }
        links.push({
          label,
          replace(candidate) { parts[2] = String(candidate.name); write(sceneChangeCommand(parts)); },
          unlink() { write("noop"); }
        });
      });
    }
  }
  const replacements = links.every(link => link.replace)
    ? animations.flatMap((candidate, index) => {
      if (candidate === source || candidate.spriteSheet !== sourceSheet || !candidate.name || candidate.name === source.name
        || animations.some(item => item !== candidate && item.spriteSheet === sourceSheet && item.name === candidate.name)
        || !links.every(link => link.compatible?.(candidate) ?? true)) return [];
      return [{ value: animationID(candidate, index), label: String(candidate.name) }];
    }) : [];
  return { source, links, usages: [...new Set(links.map(link => link.label))], replacements,
    canUnlink: links.every(link => Boolean(link.unlink)) };
}

export function planAnimationDeletion(data: GBAProjectData, id: string) {
  const { usages, canUnlink, replacements } = animationDeletion(data, id);
  return { usages, canUnlink, replacements };
}

export function resolveAnimationDeletion(data: GBAProjectData, id: string, replacementID: string | null): GBAProjectData {
  const next = structuredClone(data);
  const plan = animationDeletion(next, id);
  if (!plan.source || (replacementID ? !plan.replacements.some(choice => choice.value === replacementID) : !plan.canUnlink)) return data;
  const candidate = replacementID ? records(next.animations).find((item, index) => animationID(item, index) === replacementID) : undefined;
  for (const link of plan.links) {
    if (candidate) link.replace?.(candidate);
    else link.unlink?.();
  }
  return removeSpriteAnimationFromProject(next, id);
}
