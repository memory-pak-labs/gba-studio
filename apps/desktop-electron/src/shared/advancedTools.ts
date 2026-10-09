import type { GBAProjectData } from "./projectFile.js";
import { analyzeConditionalSceneFlow, type ConditionalSceneFlowReport } from "./conditionalFlowAnalyzer.js";
import { createInputReplay, type InputReplay } from "./inputReplay.js";
import {
  budgetParticleEmitter,
  compileActorStateMachine,
  compileCinematicTimeline,
  compileGraphicEffectSequence,
  type ActorStateMachine,
  type CinematicTimeline,
  type GraphicEffectSequence,
  type SaveLabSnapshot
} from "./optionalProductionTools.js";
import { resolveSceneCapabilityManifest } from "./sceneFeatureModules.js";

export type AdvancedToolID =
  | "inputReplay"
  | "autotile"
  | "asepriteTsx"
  | "particles"
  | "stateMachines"
  | "cinematicTimeline"
  | "effectsSequencer"
  | "fontEditor"
  | "localization"
  | "saveLab"
  | "linkCable"
  | "pluginDev"
  | "gameplayComponents";

export interface AdvancedToolCard {
  id: AdvancedToolID;
  title: string;
  detail: string;
  enabled: boolean;
  resourceCount: number;
}

export interface AdvancedToolsPresentation {
  tools: AdvancedToolCard[];
  flow: ConditionalSceneFlowReport;
  summary: {
    enabled: number;
    total: number;
    unreachableScenes: number;
    blockedTransitions: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const toolDefinitions: Array<{
  id: AdvancedToolID;
  key: string;
  title: string;
  detail: string;
}> = [
  { id: "inputReplay", key: "inputReplays", title: "Gravação e reprodução de inputs", detail: "Rotas determinísticas com seed, save, variáveis e checkpoints." },
  { id: "autotile", key: "autotileSets", title: "Terreno e autotile", detail: "Máscaras de vizinhança para caminhos, paredes, bordas e colisões." },
  { id: "asepriteTsx", key: "externalAssetSources", title: "Aseprite e Tiled TSX", detail: "Fontes externas reimportáveis com tags, slices e tilesets compartilhados." },
  { id: "particles", key: "particleEmitters", title: "Partículas", detail: "Emitters com orçamento explícito de OAM e scanline." },
  { id: "stateMachines", key: "actorStateMachines", title: "Máquinas de estado", detail: "Estados e transições de atores compiláveis para eventos." },
  { id: "cinematicTimeline", key: "cinematicTimelines", title: "Timeline cinematográfica", detail: "Faixas de câmera, atores, diálogo, áudio e eventos." },
  { id: "effectsSequencer", key: "effectSequences", title: "Sequenciador de efeitos", detail: "Keyframes de paleta, blend, mosaico, fade e scanline." },
  { id: "fontEditor", key: "fontProjects", title: "Fontes e glifos", detail: "Glifos, largura variável, kerning e fallback por idioma." },
  { id: "localization", key: "localizationInterchanges", title: "Intercâmbio de localização", detail: "Perfis CSV/XLIFF e auditoria de cobertura de glifos." },
  { id: "saveLab", key: "saveLabSnapshots", title: "Laboratório de saves", detail: "Estados reproduzíveis, slots e cenários de corrupção controlada." },
  { id: "linkCable", key: "linkCableSessions", title: "Link Cable", detail: "Sessões multi-instância, transferências, latência e timeout." },
  { id: "pluginDev", key: "pluginDevelopment", title: "Desenvolvimento de plugins", detail: "Hot reload, permissões, console isolado e validação." },
  { id: "gameplayComponents", key: "gameplayComponents", title: "Componentes de gameplay", detail: "Receitas reutilizáveis construídas com eventos e prefabs nativos." }
];

function toolsRecord(data: GBAProjectData): Record<string, unknown> {
  return isRecord(data.advancedTools) ? data.advancedTools : {};
}

function resourceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length > 0 ? 1 : 0;
  return value ? 1 : 0;
}

function advancedResourceArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = toolsRecord(data)[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function resourceID(resource: Record<string, unknown>): string {
  return typeof resource.id === "string" ? resource.id : "";
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function integerValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function deriveAdvancedToolsPresentation(data: GBAProjectData): AdvancedToolsPresentation {
  const resources = toolsRecord(data);
  const tools = toolDefinitions.map((definition) => {
    const count = resourceCount(resources[definition.key]);
    return {
      id: definition.id,
      title: definition.title,
      detail: definition.detail,
      enabled: count > 0,
      resourceCount: count
    };
  });
  const flow = analyzeConditionalSceneFlow(data);
  return {
    tools,
    flow,
    summary: {
      enabled: tools.filter((tool) => tool.enabled).length,
      total: tools.length,
      unreachableScenes: flow.unreachableScenes.length,
      blockedTransitions: flow.blockedTransitions.length
    }
  };
}

function defaultToolResource(toolID: AdvancedToolID): { key: string; value: unknown } {
  switch (toolID) {
    case "inputReplay":
      return { key: "inputReplays", value: [createInputReplay({ id: "replay-1", seed: 1 })] };
    case "autotile":
      return { key: "autotileSets", value: [{ id: "terrain-1", name: "Terreno", baseTile: 0, topology: "four-neighbor" }] };
    case "asepriteTsx":
      return { key: "externalAssetSources", value: [{ id: "source-1", kind: "aseprite", path: "", reimport: true }] };
    case "particles":
      return { key: "particleEmitters", value: [{ id: "emitter-1", name: "Poeira", preset: "dust", maxParticles: 12, maxPerScanline: 6, lifetimeFrames: 24 }] };
    case "stateMachines":
      return { key: "actorStateMachines", value: [{ id: "machine-1", name: "Inimigo", initialState: "idle", states: [{ id: "idle" }, { id: "patrol" }, { id: "attack" }], transitions: [] }] };
    case "cinematicTimeline":
      return { key: "cinematicTimelines", value: [{ id: "timeline-1", name: "Cena", durationFrames: 180, tracks: [{ kind: "camera", keyframes: [] }, { kind: "events", keyframes: [] }] }] };
    case "effectsSequencer":
      return { key: "effectSequences", value: [{ id: "effects-1", name: "Efeitos", durationFrames: 60, tracks: [{ kind: "fade", keyframes: [{ frame: 0, value: 0 }, { frame: 60, value: 16 }] }] }] };
    case "fontEditor":
      return { key: "fontProjects", value: [{ id: "font-1", name: "Fonte GBA", glyphWidth: 8, glyphHeight: 8, variableWidth: true, kerning: [], fallbacks: {} }] };
    case "localization":
      return { key: "localizationInterchanges", value: [{ id: "locale-1", format: "csv", sourceLocale: "pt-BR", targetLocales: [] }] };
    case "saveLab":
      return { key: "saveLabSnapshots", value: [{ id: "save-1", name: "Início", slot: 0, variables: {}, inventory: {}, corruption: "none" }] };
    case "linkCable":
      return { key: "linkCableSessions", value: [{ id: "link-1", players: 2, latencyFrames: 0, timeoutFrames: 120, transfers: [] }] };
    case "pluginDev":
      return { key: "pluginDevelopment", value: { hotReload: true, isolatedConsole: true, validatePermissions: true, permissions: [] } };
    case "gameplayComponents":
      return { key: "gameplayComponents", value: [{ id: "components", installed: [] }] };
  }
}

export function enableAdvancedToolInProject(data: GBAProjectData, toolID: AdvancedToolID): GBAProjectData {
  if (!toolDefinitions.some((tool) => tool.id === toolID)) return data;
  const next = clone(data);
  const tools = isRecord(next.advancedTools) ? next.advancedTools : {};
  next.advancedTools = tools;
  const resource = defaultToolResource(toolID);
  if (resourceCount(tools[resource.key]) === 0) tools[resource.key] = resource.value;
  return next;
}

export function updateAdvancedToolResourceInProject(
  data: GBAProjectData,
  key: string,
  id: string,
  patch: Record<string, unknown>
): GBAProjectData {
  const resources = advancedResourceArray(data, key);
  if (!resources.some((resource) => resourceID(resource) === id)) return data;
  const next = clone(data);
  const tools = isRecord(next.advancedTools) ? next.advancedTools : {};
  tools[key] = resources.map((resource) => resourceID(resource) === id
    ? { ...resource, ...clone(patch), id }
    : clone(resource));
  next.advancedTools = tools;
  return next;
}

export function addAdvancedToolResourceInProject(
  data: GBAProjectData,
  key: string,
  resource: Record<string, unknown>
): GBAProjectData {
  const id = resourceID(resource);
  if (!id) return data;
  const next = clone(data);
  const tools = isRecord(next.advancedTools) ? next.advancedTools : {};
  const resources = advancedResourceArray(next, key);
  tools[key] = [...resources.filter((item) => resourceID(item) !== id), clone(resource)];
  next.advancedTools = tools;
  return next;
}

export function removeAdvancedToolResourceInProject(
  data: GBAProjectData,
  key: string,
  id: string
): GBAProjectData {
  const resources = advancedResourceArray(data, key);
  if (!resources.some((resource) => resourceID(resource) === id)) return data;
  const next = clone(data);
  const tools = isRecord(next.advancedTools) ? next.advancedTools : {};
  tools[key] = resources.filter((resource) => resourceID(resource) !== id).map(clone);
  next.advancedTools = tools;
  return next;
}

export function saveInputReplayInProject(data: GBAProjectData, replay: InputReplay): GBAProjectData {
  const next = clone(data);
  const tools = isRecord(next.advancedTools) ? next.advancedTools : {};
  const replays = Array.isArray(tools.inputReplays) ? tools.inputReplays : [];
  tools.inputReplays = [...replays.filter((item) => !isRecord(item) || item.id !== replay.id), structuredClone(replay)];
  next.advancedTools = tools;
  return next;
}

export function applyAutotileTerrainInProject(
  data: GBAProjectData,
  roomID: string,
  selectedCellIndexes: readonly number[],
  baseTile: number
): GBAProjectData {
  const next = clone(data);
  const collectionKey = Array.isArray(next.rooms) ? "rooms" : "scenas";
  const rooms = Array.isArray(next[collectionKey]) ? next[collectionKey] as unknown[] : [];
  const room = rooms.find((entry) => isRecord(entry) && (entry.id === roomID || entry.name === roomID));
  if (!isRecord(room)) return data;
  const width = typeof room.width === "number" && room.width > 0 ? Math.floor(room.width) : 0;
  const height = typeof room.height === "number" && room.height > 0 ? Math.floor(room.height) : 0;
  if (width === 0 || height === 0 || !Array.isArray(room.tilemap)) return data;
  const selected = new Set(selectedCellIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < width * height));
  const tilemap = [...room.tilemap] as number[];
  for (const index of selected) {
    const x = index % width;
    const y = Math.floor(index / width);
    let mask = 0;
    if (y > 0 && selected.has(index - width)) mask |= 1;
    if (x < width - 1 && selected.has(index + 1)) mask |= 2;
    if (y < height - 1 && selected.has(index + width)) mask |= 4;
    if (x > 0 && selected.has(index - 1)) mask |= 8;
    tilemap[index] = baseTile + mask;
  }
  room.tilemap = tilemap;
  return next;
}

export type GameplayComponentID =
  | "dialogue"
  | "shop"
  | "quest"
  | "inventory"
  | "checkpoint"
  | "door"
  | "enemy"
  | "hud";

export function installGameplayComponentInProject(
  data: GBAProjectData,
  componentID: GameplayComponentID
): GBAProjectData {
  const definitions: Record<GameplayComponentID, { name: string; steps: Array<{ command: string }> }> = {
    dialogue: {
      name: "component_dialogue_show",
      steps: [{ command: "show_dialogue component_dialogue_default" }]
    },
    checkpoint: {
      name: "component_checkpoint_activate",
      steps: [{ command: "store_engine_field current_room checkpoint.room" }, { command: "save_game 0" }]
    },
    shop: {
      name: "component_shop_open",
      steps: [{ command: "set_variable component.shop.open 1" }]
    },
    quest: {
      name: "component_quest_start",
      steps: [{ command: "set_variable quest.active 1" }]
    },
    inventory: {
      name: "component_inventory_add",
      steps: [{ command: "add_item item.default 1" }]
    },
    door: {
      name: "component_door_use",
      steps: [{ command: "fade_out 12" }, { command: "fade_in 12" }]
    },
    enemy: {
      name: "component_enemy_spawn",
      steps: [{ command: "set_variable component.enemy.active 1" }]
    },
    hud: {
      name: "component_hud_refresh",
      steps: [{ command: "set_variable component.hud.refresh 1" }]
    }
  };
  const definition = definitions[componentID];
  const next = clone(data);
  const events = Array.isArray(next.events) ? next.events as unknown[] : [];
  if (!events.some((event) => isRecord(event) && event.name === definition.name)) {
    next.events = [...events, { id: definition.name, name: definition.name, category: "Componente", steps: definition.steps }];
  }
  if (componentID === "dialogue") {
    const dialogues = Array.isArray(next.dialogues) ? next.dialogues as unknown[] : [];
    if (!dialogues.some((dialogue) => isRecord(dialogue) && dialogue.key === "component_dialogue_default")) {
      next.dialogues = [...dialogues, {
        key: "component_dialogue_default",
        character: "Sistema",
        text: "Novo diálogo",
        choices: [],
        translations: { "pt-BR": "Novo diálogo" },
        translationStatus: { "pt-BR": "draft" },
        choiceTranslations: {},
        portrait: "",
        emote: "",
        textSound: "",
        confirmSound: ""
      }];
    }
  }
  return next;
}

export interface AdvancedToolsExportContract {
  schema: 1;
  replays: Array<{
    id: string;
    seed: number;
    initial_save_slot: number | null;
    frame_count: number;
    runs: Array<{ held: string[]; pressed: string[]; frames: number }>;
  }>;
  save_snapshots: Array<{
    id: string;
    name: string;
    slot: number;
    variables: Record<string, boolean | number | string>;
    inventory: Record<string, number>;
    corruption: string;
  }>;
  state_machines: Array<{
    id: string;
    initial_state: string;
    state_count: number;
    transition_count: number;
  }>;
  timelines: Array<{ id: string; duration_frames: number; keyframe_count: number }>;
  effects: Array<{ id: string; duration_frames: number; keyframe_count: number }>;
  particles: Array<{
    id: string;
    preset: string;
    max_particles: number;
    max_per_scanline: number;
    lifetime_frames: number;
  }>;
  fonts: Array<{
    id: string;
    glyph_width: number;
    glyph_height: number;
    variable_width: boolean;
    glyph_count: number;
  }>;
  localization: Array<{
    id: string;
    source_locale: string;
    target_locales: string[];
    entry_count: number;
  }>;
  gameplay_components: string[];
}

export interface CompiledAdvancedTools {
  contract: AdvancedToolsExportContract;
  events: Array<{ id: string; name: string; category: string; steps: Array<{ command: string }> }>;
  hasResources: boolean;
}

function timelineEvent(
  id: string,
  name: string,
  category: string,
  keyframes: Array<{ frame: number; command: string }>
): { id: string; name: string; category: string; steps: Array<{ command: string }> } {
  let previousFrame = 0;
  const steps: Array<{ command: string }> = [];
  for (const keyframe of keyframes) {
    const waitFrames = Math.max(0, keyframe.frame - previousFrame);
    if (waitFrames > 0) steps.push({ command: `wait ${waitFrames}` });
    steps.push({ command: keyframe.command });
    previousFrame = keyframe.frame;
  }
  return { id, name, category, steps };
}

function safeStateMachine(resource: Record<string, unknown>): ActorStateMachine | null {
  const id = resourceID(resource);
  const states = Array.isArray(resource.states) ? resource.states.filter(isRecord).map((state) => ({
    id: stringValue(state.id),
    ...(stringValue(state.animation) ? { animation: stringValue(state.animation) } : {}),
    ...(stringArray(state.onAnimationComplete).length > 0 ? { onAnimationComplete: stringArray(state.onAnimationComplete) } : {}),
    onEnter: stringArray(state.onEnter),
    onUpdate: stringArray(state.onUpdate),
    onExit: stringArray(state.onExit)
  })).filter((state) => state.id) : [];
  const transitions = Array.isArray(resource.transitions) ? resource.transitions.filter(isRecord).map((transition) => ({
    from: stringValue(transition.from),
    to: stringValue(transition.to),
    condition: stringValue(transition.condition, "if_true"),
    ...(stringValue(transition.event) ? { event: stringValue(transition.event) } : {})
  })).filter((transition) => transition.from && transition.to) : [];
  if (!id || states.length === 0) return null;
  return {
    id,
    ...(stringValue(resource.actor) ? { actor: stringValue(resource.actor) } : {}),
    initialState: stringValue(resource.initialState, states[0].id),
    states,
    transitions
  };
}

export function compileAdvancedToolsForExport(
  data: GBAProjectData,
  options: { stateMachines?: boolean } = {}
): CompiledAdvancedTools {
  const replays = advancedResourceArray(data, "inputReplays");
  const saves = advancedResourceArray(data, "saveLabSnapshots");
  const machines = options.stateMachines === false ? [] : advancedResourceArray(data, "actorStateMachines");
  const timelines = advancedResourceArray(data, "cinematicTimelines");
  const effects = advancedResourceArray(data, "effectSequences");
  const particles = advancedResourceArray(data, "particleEmitters");
  const fonts = advancedResourceArray(data, "fontProjects");
  const localization = advancedResourceArray(data, "localizationInterchanges");
  const components = advancedResourceArray(data, "gameplayComponents")
    .flatMap((resource) => stringArray(resource.installed));

  const events: CompiledAdvancedTools["events"] = [];
  for (const resource of machines) {
    const machine = safeStateMachine(resource);
    if (machine) events.push(...compileActorStateMachine(machine));
  }
  for (const resource of timelines) {
    const timeline = {
      id: resourceID(resource),
      tracks: Array.isArray(resource.tracks) ? resource.tracks : []
    } as CinematicTimeline;
    const keyframes = compileCinematicTimeline(timeline);
    if (timeline.id) {
      events.push(timelineEvent(
        `timeline-${timeline.id}`,
        `timeline_${timeline.id}`,
        "Timeline cinematográfica",
        keyframes
      ));
    }
  }
  for (const resource of effects) {
    const sequence = {
      id: resourceID(resource),
      tracks: Array.isArray(resource.tracks) ? resource.tracks : []
    } as GraphicEffectSequence;
    const keyframes = compileGraphicEffectSequence(sequence);
    if (sequence.id) {
      events.push(timelineEvent(
        `effects-${sequence.id}`,
        `effects_${sequence.id}`,
        "Sequenciador de efeitos",
        keyframes
      ));
    }
  }

  const contract: AdvancedToolsExportContract = {
    schema: 1,
    replays: replays.map((replay) => ({
      id: resourceID(replay),
      seed: integerValue(replay.seed),
      initial_save_slot: replay.initialSaveSlot === null ? null : integerValue(replay.initialSaveSlot),
      frame_count: integerValue(replay.frameCount),
      runs: Array.isArray(replay.runs) ? replay.runs.filter(isRecord).map((run) => {
        const frame = isRecord(run.frame) ? run.frame : {};
        return {
          held: stringArray(frame.held),
          pressed: stringArray(frame.pressed),
          frames: Math.max(1, integerValue(run.frames, 1))
        };
      }) : []
    })).filter((replay) => replay.id),
    save_snapshots: saves.map((save) => ({
      id: resourceID(save),
      name: stringValue(save.name, resourceID(save)),
      slot: integerValue(save.slot),
      variables: isRecord(save.variables) ? clone(save.variables) as Record<string, boolean | number | string> : {},
      inventory: isRecord(save.inventory) ? clone(save.inventory) as Record<string, number> : {},
      corruption: stringValue(save.corruption, "none")
    })).filter((save) => save.id),
    state_machines: machines.map((resource) => {
      const machine = safeStateMachine(resource);
      return machine ? {
        id: machine.id,
        initial_state: machine.initialState,
        state_count: machine.states.length,
        transition_count: machine.transitions.length
      } : null;
    }).filter((machine): machine is NonNullable<typeof machine> => Boolean(machine)),
    timelines: timelines.map((timeline) => ({
      id: resourceID(timeline),
      duration_frames: Math.max(0, integerValue(timeline.durationFrames)),
      keyframe_count: Array.isArray(timeline.tracks)
        ? timeline.tracks.filter(isRecord).reduce((count, track) => count + (Array.isArray(track.keyframes) ? track.keyframes.length : 0), 0)
        : 0
    })).filter((timeline) => timeline.id),
    effects: effects.map((effect) => ({
      id: resourceID(effect),
      duration_frames: Math.max(0, integerValue(effect.durationFrames)),
      keyframe_count: Array.isArray(effect.tracks)
        ? effect.tracks.filter(isRecord).reduce((count, track) => count + (Array.isArray(track.keyframes) ? track.keyframes.length : 0), 0)
        : 0
    })).filter((effect) => effect.id),
    particles: particles.map((particle) => {
      const budget = budgetParticleEmitter({
        maxParticles: integerValue(particle.maxParticles),
        maxPerScanline: integerValue(particle.maxPerScanline)
      }, { reservedOam: 0, reservedPerScanline: 0 });
      return {
        id: resourceID(particle),
        preset: stringValue(particle.preset, "custom"),
        max_particles: budget.maxParticles,
        max_per_scanline: budget.maxPerScanline,
        lifetime_frames: Math.max(1, integerValue(particle.lifetimeFrames, 1))
      };
    }).filter((particle) => particle.id),
    fonts: fonts.map((font) => ({
      id: resourceID(font),
      glyph_width: Math.max(1, integerValue(font.glyphWidth, 8)),
      glyph_height: Math.max(1, integerValue(font.glyphHeight, 8)),
      variable_width: font.variableWidth === true,
      glyph_count: Array.isArray(font.glyphs) ? font.glyphs.length : 0
    })).filter((font) => font.id),
    localization: localization.map((locale) => ({
      id: resourceID(locale),
      source_locale: stringValue(locale.sourceLocale, "pt-BR"),
      target_locales: stringArray(locale.targetLocales),
      entry_count: Array.isArray(locale.entries) ? locale.entries.length : 0
    })).filter((locale) => locale.id),
    gameplay_components: [...new Set(components)].sort()
  };
  const hasResources = Object.entries(contract)
    .some(([key, value]) => key !== "schema" && Array.isArray(value) && value.length > 0);
  return { contract, events, hasResources };
}

function projectScenes(data: GBAProjectData): Record<string, unknown>[] {
  const scenes = Array.isArray(data.scenas) ? data.scenas.filter(isRecord) : [];
  if (scenes.length > 0) return scenes;
  return Array.isArray(data.rooms) ? data.rooms.filter(isRecord) : [];
}

function projectHasSceneCapability(data: GBAProjectData, capabilityID: string): boolean {
  return projectScenes(data).some((scene) => {
    const runtime = isRecord(scene.runtime) ? scene.runtime : {};
    const config = isRecord(runtime.config) ? runtime.config : {};
    const sceneType = stringValue(scene.sceneType, stringValue(runtime.type, "topdown"));
    const manifest = resolveSceneCapabilityManifest(
      sceneType,
      Object.hasOwn(config, "modules") ? config.modules : undefined,
      undefined,
      Object.hasOwn(config, "capabilities") ? config.capabilities : undefined
    );
    return manifest.capabilities.some((capability) => capability.id === capabilityID && capability.status.enabled);
  });
}

export function projectWithCompiledAdvancedTools(data: GBAProjectData): {
  data: GBAProjectData;
  compiled: CompiledAdvancedTools;
} {
  const compiled = compileAdvancedToolsForExport(data, {
    stateMachines: projectHasSceneCapability(data, "animation_state_machine")
  });
  if (compiled.events.length === 0) return { data, compiled };
  const existingEvents = Array.isArray(data.events) ? data.events.filter(isRecord) : [];
  const compiledNames = new Set(compiled.events.map((event) => event.name));
  return {
    data: {
      ...clone(data),
      events: [
        ...existingEvents.filter((event) => !compiledNames.has(stringValue(event.name))),
        ...compiled.events
      ]
    },
    compiled
  };
}
