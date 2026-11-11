import { planAnimationDeletion } from "./animationDeletion.js";
import { audioSourceAsset } from "./audioContract.js";
import { authoredEventCommandRecords } from "./authoredEventCommands.js";
import { removeAssetRecordsFromProject } from "./filesWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";
import { sceneChangeCommand, sceneChangeCommandParts } from "./sceneChangeCommand.js";

type RecordValue = Record<string, unknown>;
type Slot = { label: string; replace?: (asset: RecordValue) => void; unlink?: () => void; compatible?: (asset: RecordValue) => boolean };

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function assetID(asset: RecordValue, index: number): string {
  return String(asset.id || `asset-${index + 1}`);
}

const optionalFields = new Set([
  "backgroundAssetName", "titleOverlayAssetName", "portrait", "portraitAssetName", "defaultPortrait",
  "emote", "emoteAssetName", "assetName", "hudAssetName", "cursorAssetName", "disabledEscapeAssetName",
  "selectorImage", "boxImage", "backgroundImage", "hudImage", "font", "cursorImage",
  "music", "textSound", "confirmSound", "characterSound", "generatedSpriteAssetName", "playerExplosionSprite"
]);
const requiredFields = new Set([
  "runtimeCompositeBackgroundAssetName", "runtimeBaseBackgroundAssetName", "tilesetAssetName",
  "spriteSheet", "sourceSheet", "spriteSource", "sheet", "asset", "assetId", "assetID", "sampleAssetID", "sourceAssetID",
  "panoramaBackgroundId", "floorTilemapId", "minimapAssetId", "backgroundAsset", "foregroundAsset",
  "surfaceAsset", "gridAsset", "hudLayout", "cursorAsset", "rangeAsset", "targetAsset", "emotesAsset",
  "feedbackAsset", "emptyAsset", "playerSprite", "spriteAsset", "assetPath"
]);
const audioFields = new Set(["music", "textSound", "confirmSound", "characterSound", "victoryMusic"]);
const audioMaps = new Set(["actionSounds", "cues"]);
const defaultMaps = new Set(["defaultPlayerSprites", "defaultBackgrounds"]);
const fieldMaps = new Set(["dungeonDepthSheets", "compactHud"]);
const dungeonMaterialArrays = new Set(["materialAssets", "dungeonMaterialAssets"]);
const positionalArrays = new Set(["tileSourceAssetNames", "stateAssets"]);
const optionalArrays = new Set(["frameAssetNames"]);

function fileExtension(asset: RecordValue): string {
  return String(record(asset.metadata).source ?? asset.name ?? "").match(/\.[^./]+$/)?.[0].toLowerCase() ?? "";
}

function sameAssetFormat(source: RecordValue, candidate: RecordValue): boolean {
  const kind = String(source.kind ?? "").toLowerCase();
  if (String(candidate.kind ?? "").toLowerCase() !== kind || !candidate.name || candidate.name === source.name) return false;
  const extension = fileExtension(source);
  if (extension !== fileExtension(candidate)) return false;
  const oldMetadata = record(source.metadata);
  const newMetadata = record(candidate.metadata);
  if (oldMetadata.source && !newMetadata.source) return false;
  const layout = ["width", "height", "frameWidth", "frameHeight", "tileWidth", "tileHeight", "kind", "tileLayout",
    "colorMode", "color_mode", "spriteColorMode", "pixelFormat", "affine", "transparent", "transparentIndex"];
  if (!layout.every(key => JSON.stringify(oldMetadata[key] ?? null) === JSON.stringify(newMetadata[key] ?? null))) return false;
  if (typeof oldMetadata.frameCount === "number"
    && (typeof newMetadata.frameCount !== "number" || newMetadata.frameCount < oldMetadata.frameCount)) return false;
  return true;
}

function assetSlots(data: GBAProjectData, source: RecordValue): Slot[] {
  const slots: Slot[] = [];
  const assets = records(data.assets);
  const sounds = records(data.audioItems);
  const soundNames = new Set(sounds.flatMap(sound => [sound.name, sound.exportID]).filter(Boolean));
  const oldPath = record(source.metadata).source;
  const hasSharedPath = oldPath && assets.some(asset => asset !== source && record(asset.metadata).source === oldPath);
  function referenceKind(value: unknown): "id" | "name" | "path" | null {
    if (typeof value !== "string" || !value) return null;
    if (value === source.name) return "name";
    if (value === source.id) return "id";
    if (!hasSharedPath && value === oldPath) return "path";
    return null;
  }

  function assetValue(asset: RecordValue, kind: "id" | "name" | "path"): unknown {
    return kind === "path" ? record(asset.metadata).source : asset[kind];
  }

  const authoredCommands = authoredEventCommandRecords(data);
  const actors = records(data.actors);
  const actorNames = actors.flatMap(actor => [actor.id, actor.name]).filter((name): name is string => typeof name === "string");
  const bundledSource = record(source.metadata).bundledDefaultAsset;
  const isStarterSheet = source.kind === "Sprite" && typeof bundledSource === "string" && bundledSource.startsWith("template:blank/");
  const clips = records(data.animations);
  const sheetClips = isStarterSheet ? clips.filter(clip => clip.spriteSheet === source.name) : [];
  const sheetStates = isStarterSheet ? records(data.animationStates).filter(state => state.spriteSheet === source.name) : [];
  const ownsAllClips = sheetClips.every(clip => {
    if (typeof clip.id !== "string") return false;
    const plan = planAnimationDeletion(data, clip.id);
    return plan.canUnlink && plan.usages.every(usage => usage.startsWith("Estado de animação:"));
  });
  const ownIDs = new Set(sheetClips.map(clip => clip.id));
  const stateIsUsed = (state: RecordValue): boolean => {
    if ([...actors, ...records(data.actorPrefabs)].some(actor => state.id && actor.animationStateID === state.id)) return true;
    return authoredCommands.some(owner => [owner.command, ...(typeof owner.commands === "string" ? owner.commands.split(/\r?\n/) : [])]
      .some(command => {
        if (typeof command !== "string") return false;
        const [verb, , id] = sceneChangeCommandParts(command, actorNames);
        return verb === "set_actor_animation_state" && Boolean(id) && (id === state.name || id === state.id);
      }));
  };
  const ownsAllStates = sheetStates.every(state => !stateIsUsed(state)
    && (!Array.isArray(state.animationIDs) || state.animationIDs.every(id => ownIDs.has(id))));
  const canDetachLibrarySheet = isStarterSheet && ownsAllClips && ownsAllStates;

  function slot(owner: RecordValue, key: string, label: string, canUnlink: boolean, emptyValue = false): void {
    const kind = referenceKind(owner[key]);
    if (!kind) return;
    slots.push({ label, compatible: asset => Boolean(assetValue(asset, kind)), replace(asset) { owner[key] = assetValue(asset, kind); },
      ...(canUnlink ? { unlink() {
        if (emptyValue) owner[key] = "";
        else delete owner[key];
      } } : {}) });
  }

  function visit(value: unknown, label: string, context = ""): void {
    if (Array.isArray(value)) {
      const scopeNames: Record<string, string> = {
        steps: "quadro", screens: "tela", tileLayers: "camada", hudPresets: "HUD",
        components: "componente", units: "unidade", themes: "tema"
      };
      value.forEach((entry, index) => {
        if (!entry || typeof entry !== "object") return;
        const scope = scopeNames[context];
        const title = record(entry).name ?? record(entry).label ?? record(entry).id ?? index + 1;
        visit(entry, scope ? `${label} · ${scope} ${String(title)}` : label, context);
      });
      return;
    }
    if (!value || typeof value !== "object") return;
    const owner = record(value);
    for (const [key, field] of Object.entries(owner)) {
      if (key === "metadata" || key === "command" || key === "commands" || (context === "audioItems" && key === "sourceAssetID")) continue;
      const kind = referenceKind(field);
      if (kind && context === "pcmSfx" && key === "sampleAssetID") {
        slots.push({ label: `${label} · sample PCM`, compatible: asset => fileExtension(asset) === ".wav",
          replace(asset) { owner.sampleAssetID = asset.id; },
          unlink() { owner.sampleAssetID = null; owner.source = "synth"; } });
        continue;
      }
      const isAudio = audioFields.has(key) || audioMaps.has(context);
      if (kind && isAudio && soundNames.has(field)) continue;
      if (kind) {
        const optionalSetting = defaultMaps.has(context)
          || (key === "playerSprite" && ["topdown", "shmup"].includes(context));
        const optional = optionalFields.has(key) || isAudio || optionalSetting
          || (key === "asset" && context === "components");
        if (optional || requiredFields.has(key) || fieldMaps.has(context)
          || (["path", "id"].includes(key) && ("consumer" in owner || "required" in owner))) {
          slot(owner, key, label, optional && !(key === "assetName" && context === "referenceImages"), optionalSetting);
        } else if (/asset|sprite|sheet|portrait|background|texture|image|font|sample|tilemap/i.test(key)) {
          slots.push({ label: `${label} · ${key}` });
        }
        continue;
      }
      if (Array.isArray(field) && dungeonMaterialArrays.has(key)) {
        if (field.some(referenceKind)) {
          slots.push({ label: `${label} · conjunto de materiais do Dungeon`, replace(asset) {
            owner[key] = field.map(entry => {
              const type = referenceKind(entry);
              return type ? assetValue(asset, type) : entry;
            });
          }, unlink() {
            // The runtime accepts the complete material set or its procedural fallback.
            delete owner[key];
          } });
        }
      } else if (Array.isArray(field) && (optionalArrays.has(key) || positionalArrays.has(key))) {
        if (field.some(entry => referenceKind(entry))) {
          slots.push({
            label,
            replace(asset) { owner[key] = field.map(entry => { const type = referenceKind(entry); return type ? assetValue(asset, type) : entry; }); },
            ...(optionalArrays.has(key) ? { unlink() { owner[key] = field.filter(entry => !referenceKind(entry)); } } : {})
          });
        }
      } else if (key === "tileSourceAssetNames" && record(field).encoding === "rle-v1") {
        const runs = record(field).runs;
        if (Array.isArray(runs) && runs.some(run => Array.isArray(run) && referenceKind(run[0]))) {
          slots.push({ label, replace(asset) {
            record(field).runs = runs.map(run => {
              const type = Array.isArray(run) && referenceKind(run[0]);
              return type ? [assetValue(asset, type), ...run.slice(1)] : run;
            });
          } });
        }
      } else if (key === "referenceImages" && Array.isArray(field)) {
        if (field.some(entry => referenceKind(record(entry).assetName))) {
          slots.push({
            label: `${label} · imagem de referência`,
            replace(asset) {
              for (const entry of records(field)) {
                const type = referenceKind(entry.assetName);
                if (type) entry.assetName = assetValue(asset, type);
              }
            },
            unlink() { owner[key] = field.filter(entry => !referenceKind(record(entry).assetName)); }
          });
        }
      } else {
        visit(field, label, key);
      }
    }
  }

  for (const [collection, label] of [
    ["scenas", "Cena"], ["rooms", "Cena"], ["actors", "Ator"], ["actorPrefabs", "Pré-fabricado"],
    ["triggers", "Gatilho"], ["triggerPrefabs", "Pré-fabricado"], ["animations", "Animação"],
    ["animationStates", "Estado de animação"], ["dialogues", "Diálogo"], ["spriteReferenceImages", "Referência de sprite"],
    ["audioInstruments", "Instrumento"], ["audioItems", "Áudio"], ["events", "Evento"]
  ]) {
    for (const entry of records(data[collection!])) {
      const attachedRecord = canDetachLibrarySheet && (sheetClips.includes(entry) || sheetStates.includes(entry));
      const name = `${label}: ${String(entry.name ?? entry.key ?? entry.title ?? entry.id ?? "sem nome")}`;
      const before = slots.length;
      visit(entry, attachedRecord ? `${name} · será removido junto com a folha ao desvincular` : name, collection!);
      if (attachedRecord) {
        for (const link of slots.slice(before)) link.unlink = () => {
          data[collection!] = records(data[collection!]).filter(item => item !== entry);
        };
      }
    }
  }
  for (const key of ["scena", "room"]) visit(data[key], `Cena: ${String(record(data[key]).name ?? "ativa")}`);
  for (const [key, value] of Object.entries(record(data.settings))) visit(value, `Ajustes: ${key}`, key);
  for (const [key, value] of Object.entries(record(data.advancedTools))) visit(value, `Ferramenta: ${key}`, key);

  for (const sound of sounds) {
    if (audioSourceAsset(data, sound) !== source) continue;
    slots.push({ label: `Fonte de áudio: ${String(sound.name)} · precisa de um arquivo`,
      compatible: asset => typeof asset.id === "string" && Boolean(asset.id),
      replace(asset) { sound.sourceAssetID = asset.id; } });
  }

  for (const asset of assets) {
    if (asset === source) continue;
    const metadata = record(asset.metadata);
    if (Array.isArray(metadata.dungeonMaterialAssets) && metadata.dungeonMaterialAssets.some(referenceKind)) {
      visit(metadata, `Arquivo: ${String(asset.name)}`);
    }
    const dependencies = metadata.runtimeDependencies;
    if (Array.isArray(dependencies) && dependencies.some(referenceKind)) {
      slots.push({ label: `Dependência do arquivo: ${String(asset.name)}` });
    }
  }

  const commandOperands: Record<string, number> = {
    set_actor_sprite: 2, change_actor_sprite: 2, change_player_sprite: 1,
    show_emote: 1, set_text_sfx: 1, play_music: 1, play_sfx: 1, run_audio_routine: 1
  };
  const commandOwners = new Map<RecordValue, string>();
  for (const event of records(data.events)) {
    for (const owner of [event, ...records(event.steps)]) commandOwners.set(owner, `Evento: ${String(event.name ?? event.id)}`);
  }
  for (const owner of authoredCommands) {
    for (const key of ["command", "commands"]) {
      const raw = owner[key];
      if (typeof raw !== "string") continue;
      const lines = raw.split(/(\r?\n)/);
      lines.forEach((line, index) => {
        const parts = sceneChangeCommandParts(line, actorNames);
        const verb = parts[0] ?? "";
        const operand = commandOperands[verb];
        if (operand === undefined) {
          if (/sprite|asset|texture|tilemap|background|portrait|emote|image|sample|audio/.test(verb)
            && parts.slice(1).some(referenceKind)) slots.push({ label: commandOwners.get(owner) ?? "Evento em linha do tempo" });
          return;
        }
        if (!referenceKind(parts[operand])) return;
        if (["set_text_sfx", "play_music", "play_sfx", "run_audio_routine"].includes(verb) && soundNames.has(parts[operand])) return;
        const write = (command: string) => { lines[index] = command; owner[key] = lines.join(""); };
        slots.push({
          label: commandOwners.get(owner) ?? "Evento em linha do tempo",
          compatible: asset => !["change_player_sprite", "show_emote"].includes(verb) || !/\s/.test(String(asset.name)),
          replace(asset) { parts[operand] = String(asset.name); write(sceneChangeCommand(parts)); },
          unlink() { write("noop"); }
        });
      });
    }
  }
  return slots;
}

function findAsset(data: GBAProjectData, id: string): RecordValue | undefined {
  return records(data.assets).find((asset, index) => assetID(asset, index) === id);
}

function assetDeletion(data: GBAProjectData, ids: readonly string[]) {
  const sources = ids.map(id => findAsset(data, id));
  const animations = records(data.animations);
  const assets = records(data.assets);
  const slots = sources.map(source => {
    if (!source) return [];
    const links = assetSlots(data, source);
    if (links.length && assets.some(other => other !== source && other.name === source.name)) {
      links.push({ label: `Arquivos com o mesmo nome: ${String(source.name)}` });
    }
    return links;
  });
  const selectedSheets = new Set(sources.map(source => source?.name));
  const mergedClips = animations.filter(animation => selectedSheets.has(animation.spriteSheet));
  const namesAreUnique = new Set(mergedClips.map(animation => animation.name)).size === mergedClips.length;
  const candidates = assets.flatMap((asset, index) => {
    const value = assetID(asset, index);
    const compatible = sources.every(source => source && sameAssetFormat(source, asset)
      && !animations.some(animation => animation.spriteSheet === source.name && animations.some(other =>
        other.spriteSheet === asset.name && other.name === animation.name)));
    return !ids.includes(value) && namesAreUnique && compatible && slots.every(links => links.every(link => link.compatible?.(asset) ?? true))
      ? [{ value, label: String(asset.name) }] : [];
  });
  return {
    slots, sources,
    usages: [...new Set(slots.flat().map(slot => slot.label))],
    canUnlink: slots.every(links => links.every(link => Boolean(link.unlink))),
    replacements: slots.every(links => links.every(link => Boolean(link.replace))) ? candidates : []
  };
}

export function planAssetDeletion(data: GBAProjectData, ids: readonly string[]) {
  const { usages, canUnlink, replacements } = assetDeletion(data, ids);
  return { usages, canUnlink, replacements };
}

export function resolveAssetDeletion(data: GBAProjectData, ids: readonly string[], replacementID: string | null): GBAProjectData {
  if (!ids.length) return data;
  const next = structuredClone(data);
  const uniqueIDs = [...new Set(ids)];
  // Revisit references after each item so changes to shared lists cannot overwrite one another.
  const plan = assetDeletion(next, uniqueIDs);
  if (plan.sources.some(source => !source) || (replacementID ? !plan.replacements.some(choice => choice.value === replacementID) : !plan.canUnlink)) return data;
  const replacement = replacementID ? findAsset(next, replacementID) : undefined;
  for (const source of plan.sources) {
    if (!source) continue;
    for (const link of assetSlots(next, source)) {
      if (replacement) link.replace?.(replacement);
      else link.unlink?.();
    }
  }
  return removeAssetRecordsFromProject(next, uniqueIDs);
}
