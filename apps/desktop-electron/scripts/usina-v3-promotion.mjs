import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../fixtures/asset-provenance/usina");
const preparedReportPath = path.resolve(here, "../fixtures/asset-provenance/usina/runtime-preparation.json");
const preparedReport = JSON.parse(readFileSync(preparedReportPath, "utf8"));
const PHASES = Object.freeze({
  usina_submersa: { stage: "exploration", name: "Exploração" },
  usina_combate: { stage: "combat", name: "Combate" },
  usina_saida: { stage: "exit", name: "Saída" }
});

export const USINA_V3_RUNTIME_ASSETS = Object.freeze([
  ...Object.values(PHASES).flatMap(({ stage }) => [
    { name: `usina-${stage}-background-v3-4bpp.png`, folder: "backgrounds", kind: "Background", role: "dungeon-viewport", stage },
    { name: `hud-usina-${stage}-v3-4bpp.png`, folder: "sprites", kind: "Sprite", role: "dungeon-hud-panel", stage }
  ]),
  { name: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png", folder: "sprites", kind: "Sprite", role: "dungeon-depth-actor" },
  { name: "usina-energy-cell-v3-4bpp.png", folder: "sprites", kind: "Sprite", role: "dungeon-reward" }
]);

function upsertById(items, replacement) {
  return [...(Array.isArray(items) ? items : []).filter((item) => item?.id !== replacement.id), replacement];
}

function renamedAnimation(animation, from, to, frameWidth = 64, frameHeight = 64) {
  const copied = structuredClone(animation);
  copied.id = copied.id.replace(from, to);
  copied.spriteSheet = copied.spriteSheet.replace(from, to);
  copied.frameWidth = frameWidth;
  copied.frameHeight = frameHeight;
  copied.hitboxWidth = frameWidth;
  for (const frame of copied.frames ?? []) {
    frame.id = frame.id.replace(from, to);
    frame.width = frameWidth;
    frame.height = frameHeight;
    for (const tile of frame.tiles ?? []) {
      tile.id = tile.id.replace(from, to);
      tile.sourceSheet = copied.spriteSheet;
      tile.tileWidth = frameWidth;
      tile.tileHeight = frameHeight;
      tile.sliceX = Number(frame.sourceFrameIndex ?? 0) * frameWidth;
    }
  }
  return copied;
}

function hudPreset(stage, name) {
  const id = `hud-usina-${stage}-v3`;
  const text = (suffix, label, value, y) => ({
    id: `${id}-${suffix}`, kind: "text", label, text: value, asset: "",
    x: 184, y, width: 48, height: 8, zIndex: 1, visible: true
  });
  return {
    id,
    name: `HUD Usina · ${name} v3`,
    description: "Painel 4 bpp próprio do Dungeon Crawler com dados dinâmicos separados da arte.",
    backgroundImage: "", selectorImage: "", font: "", position: "Superior",
    width: 240, height: 160, mode: "advanced",
    components: [
      { id: `${id}-panel`, kind: "frame", label: "Painel da Usina", text: "",
        asset: `hud-usina-${stage}-v3-4bpp.png`, x: 176, y: 0, width: 64,
        height: 112, zIndex: 0, visible: true },
      ...[10, 18, 26, 34, 42].map((y, index) => text(`map-row-${index + 1}`, `Mapa ${index + 1}`, "", y)),
      text("hp", "Vida", "", 56),
      text("item", "Item", "", 64),
      text("count", "Quantidade", "", 72),
      text("action", "Comando", stage === "combat" ? "A: ATQ" : "A USAR", 88)
    ]
  };
}

export function promoteApprovedUsinaV3(input, preparation = preparedReport) {
  const data = structuredClone(input);
  const records = new Map(preparation.assets.map((asset) => [path.basename(asset.prepared), asset]));
  for (const descriptor of USINA_V3_RUNTIME_ASSETS) {
    const record = records.get(descriptor.name);
    if (!record) throw new Error(`Asset preparado ausente: ${descriptor.name}`);
    data.assets = upsertById(data.assets, {
      id: descriptor.name.replace(/\.png$/, ""), kind: descriptor.kind,
      name: descriptor.name,
      systemImage: descriptor.kind === "Background" ? "rectangle.portrait.and.arrow.right" : "square.on.square",
      metadata: {
        source: `Assets/${descriptor.folder}/${descriptor.name}`,
        sourceReview: `tools/gba-sprite-prep/production/exemplo-gba-dungeon-crawler-v3-candidate/${record.source}`,
        preparedSha256: record.sha256,
        generatedBy: "usina-v3-promotion",
        provenance: "Composição da Usina v3 aprovada pelo usuário; conversão técnica RGB555/4 bpp rastreada no pacote candidato.",
        role: descriptor.role,
        ...(descriptor.kind === "Background" ? {
          sceneRoles: descriptor.stage === "exploration"
            ? ["usina-dungeon-bg", "usina-machinery"]
            : ["usina-dungeon-bg"]
        } : {}),
        ...(descriptor.stage ? { phase: descriptor.stage } : {}),
        profile: "dungeonCrawler", colorMode: "4bpp",
        ...(descriptor.kind === "Sprite" ? { reserveObjTransparentColor: true } : {}),
        reviewStatus: "approved-composition", technicalStatus: "palette-prepared"
      }
    });
  }
  for (const [sceneName, { stage, name }] of Object.entries(PHASES)) {
    const update = (scene) => scene?.name === sceneName ? {
      ...scene,
      backgroundAssetName: `usina-${stage}-background-v3-4bpp.png`,
      hudPresetId: `hud-usina-${stage}-v3`,
      runtime: {
        ...scene.runtime,
        config: {
          ...scene.runtime?.config,
          profile: `usina-submersa-${stage}-v3`,
          modules: (scene.runtime?.config?.modules ?? []).map((module) =>
            stage === "exit" && module.id === "inventory"
              ? { ...module, settings: { ...module.settings, label: "CELULA" } }
              : module
          )
        }
      }
    } : scene;
    data.scenas = (data.scenas ?? []).map(update);
    data.rooms = (data.rooms ?? []).map(update);
    data.settings.hudPresets = upsertById(data.settings.hudPresets, hudPreset(stage, name));
    const sheet = `hud-usina-${stage}-v3-4bpp.png`;
    const animationId = `hud-usina-${stage}-v3-panel`;
    data.animations = upsertById(data.animations, {
      id: animationId, name: "panel", spriteSheet: sheet,
      frameWidth: 64, frameHeight: 112, fps: 1, loops: true,
      frameCount: 1, state: "idle", direction: "none", colorMode: "4bpp",
      frames: [{
        id: `${animationId}-frame-0`, frameIndex: 0, sourceFrameIndex: 0,
        width: 64, height: 112, originX: 0, originY: 0,
        tiles: [
          { x: 0, y: 0, tileWidth: 64, tileHeight: 64 },
          { x: 0, y: 64, tileWidth: 64, tileHeight: 32 },
          { x: 0, y: 96, tileWidth: 64, tileHeight: 16 }
        ].map((part, index) => ({
          id: `${animationId}-tile-${index}`, ...part,
          sliceX: part.x, sliceY: part.y, sourceSheet: sheet,
          flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false
        }))
      }]
    });
  }
  // The approved exploration composition shows an unobstructed door. Its
  // existing on-enter trigger handles the transition when the player steps in.
  data.actors = (data.actors ?? []).filter((actor) => actor.id !== "usina-combat-gate").map((actor) => {
    if (actor.id === "usina-sentinel-v2") return {
      ...actor, spriteSheet: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png",
      animationStateID: "usina-sentinel-v3-state"
    };
    if (actor.id === "usina-energy-cell-v2") return {
      ...actor, spriteSheet: "usina-energy-cell-v3-4bpp.png",
      animationStateID: "usina-energy-cell-v3-state"
    };
    return actor;
  });
  data.events = (data.events ?? []).map((event) => {
    if (event.name !== "usina_coletar_celula" ||
        event.steps?.some((step) => step.command === "add_item usina_cell 1")) return event;
    const steps = [...(event.steps ?? [])];
    const afterFlag = steps.findIndex((step) => step.command === "set_variable var_energy_cell 1");
    if (afterFlag < 0) throw new Error("Evento da célula não define var_energy_cell");
    steps.splice(afterFlag + 1, 0, {
      id: "event-plant-reward-inventory-v3",
      command: "add_item usina_cell 1",
      isEnabled: true
    });
    return { ...event, steps };
  });
  for (const [oldSheet, newSheet, oldPrefix, newPrefix] of [
    ["usina-sentinel-v2.png", "sentinel-depth-far-mid-near-192x64-v3-4bpp.png", "usina-sentinel-v2", "usina-sentinel-v3"],
    ["usina-energy-cell-v2.png", "usina-energy-cell-v3-4bpp.png", "usina-energy-cell-v2", "usina-energy-cell-v3"]
  ]) {
    for (const animation of data.animations.filter((item) => item.spriteSheet === oldSheet)) {
      const promoted = renamedAnimation(animation, oldPrefix, newPrefix);
      promoted.spriteSheet = newSheet;
      for (const frame of promoted.frames ?? []) {
        for (const tile of frame.tiles ?? []) tile.sourceSheet = newSheet;
      }
      data.animations = upsertById(data.animations, promoted);
    }
    for (const state of data.animationStates.filter((item) => item.spriteSheet === oldSheet)) {
      data.animationStates = upsertById(data.animationStates, {
        ...state,
        id: state.id.replace(oldPrefix, newPrefix),
        spriteSheet: newSheet,
        animationIDs: state.animationIDs.map((id) => id.replace(oldPrefix, newPrefix))
      });
    }
  }
  return data;
}

export async function syncApprovedUsinaV3Assets(projectPath) {
  const report = preparedReport;
  const records = new Map(report.assets.map((record) => [path.basename(record.prepared), record]));
  for (const descriptor of USINA_V3_RUNTIME_ASSETS) {
    const source = path.join(packageRoot, "prepared", descriptor.name);
    const target = path.join(path.dirname(projectPath), "Assets", descriptor.folder, descriptor.name);
    const hash = createHash("sha256").update(await readFile(source)).digest("hex");
    if (hash !== records.get(descriptor.name)?.sha256) throw new Error(`Hash divergente: ${descriptor.name}`);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return report;
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  for (const projectPath of process.argv.slice(2)) {
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    const report = await syncApprovedUsinaV3Assets(projectPath);
    await writeFile(projectPath, `${JSON.stringify(promoteApprovedUsinaV3(project, report), null, 2)}\n`);
  }
}
