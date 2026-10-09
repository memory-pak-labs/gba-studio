import { access, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetSyncManifestOverrides = new Map();

function assetSourcesFromProject(project) {
  if (!Array.isArray(project?.assets)) return null;
  return new Set(project.assets
    .map((asset) => asset?.metadata?.source)
    .filter((source) => typeof source === "string")
    .map((source) => source.replaceAll("\\", "/"))
    .filter((source) => source.startsWith("Assets/")));
}

export function setVerticeAssetSyncManifest(projectPath, project) {
  const sources = assetSourcesFromProject(project?.data ?? project);
  if (sources === null) throw new Error("O manifesto de sincronização precisa declarar a lista assets.");
  assetSyncManifestOverrides.set(path.resolve(projectPath), sources);
}

export function clearVerticeAssetSyncManifest(projectPath) {
  assetSyncManifestOverrides.delete(path.resolve(projectPath));
}

async function readAssetSyncManifest(projectPath) {
  const projectKey = path.resolve(projectPath);
  if (assetSyncManifestOverrides.has(projectKey)) return assetSyncManifestOverrides.get(projectKey);
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  return assetSourcesFromProject(project);
}

export const VERTICE_RACING_ART_DIRECTION = Object.freeze({
  profile: "diesel-fantasy-v2",
  topdownTrack: Object.freeze({
    size: Object.freeze({ width: 480, height: 320 }),
    tileSize: 8,
    roomTiles: Object.freeze({ width: 60, height: 40 }),
    regions: Object.freeze(["road", "curb", "sea", "shore", "beacons", "dock"])
  }),
  archivedPseudo3d: Object.freeze({
    panorama: Object.freeze({ width: 240, height: 160 }),
    affineFloor: Object.freeze({ width: 512, height: 512 }),
    minimap: Object.freeze({ width: 128, height: 128 })
  }),
  racers: Object.freeze({
    frameSize: Object.freeze({ width: 32, height: 32 }),
    frames: Object.freeze(["steer-left", "straight", "steer-right"]),
    maxVisibleColors: 15
  })
});

export const VERTICE_RACING_ASSET_LAYOUT = Object.freeze([
  { source: "prepared/vertice-circuit-topdown.png", name: "circuit-topdown.png", destination: "backgrounds" },
  { source: "prepared/vertice-nara-racer.png", name: "nara-racer.png", destination: "sprites" },
  { source: "prepared/vertice-rival-racer.png", name: "rival-racer.png", destination: "sprites" }
]);

export const VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT = Object.freeze([
  {
    source: "platformer/prepared/v2/vertice-nara-platformer-pilot.png",
    name: "nara-platformer.png",
    destination: "sprites"
  },
  {
    source: "isometric/prepared/v2/vertice-nara-isometric-pilot.png",
    name: "nara-isometric.png",
    destination: "sprites"
  },
  {
    source: "shmup/prepared/v2/vertice-aurora-kite-pilot.png",
    name: "nara-flight.png",
    destination: "sprites"
  },
  {
    source: "luta/prepared/v2/vertice-nara-fighter-pilot.png",
    name: "nara-fighter.png",
    destination: "sprites"
  },
  {
    source: "racing/prepared/v2/vertice-lumen-skiff-pilot.png",
    name: "nara-racer.png",
    destination: "sprites"
  }
]);

export const VERTICE_LUTA_ASSET_LAYOUT = Object.freeze([
  {
    source: "../exemplo-gba-luta-cais-v3-candidate/prepared/arena-cais-do-farol-240x160-exact-reference-plan.png",
    name: "arena-gba.png",
    destination: "backgrounds"
  },
  {
    source: "../exemplo-gba-luta-cais-v3-candidate/prepared/vertice-fight-hud-v2-arena-bank-05.png",
    name: "fight-hud-v2-arena-bank-05.png",
    destination: "backgrounds"
  },
  {
    source: "../exemplo-gba-luta-cais-v3-candidate/prepared/fighter-player-64x64-explicit-object-palette.png",
    name: "nara-fighter.png",
    destination: "sprites"
  },
  {
    source: "../exemplo-gba-luta-cais-v3-candidate/prepared/fighter-rival-64x64-left-explicit-object-palette.png",
    name: "rival-fighter.png",
    destination: "sprites"
  }
]);

const VERTICE_SPRITE_LIBRARY_4BPP_NAMES = Object.freeze([
  "airship.png",
  "battle-ui.png",
  "cliff-prop.png",
  "companion.png",
  "dialogue-sigil.png",
  "energy-cell.png",
  "guardian-portrait.png",
  "market-trader.png",
  "mechanic.png",
  "battle-rpg-scene-party-mechanic-alpha128-v2.png",
  "nara-dungeon.png",
  "nara-fighter.png",
  "nara-flight.png",
  "nara-isometric.png",
  "nara-platformer.png",
  "nara-portrait.png",
  "nara-racer.png",
  "nara-topdown.png",
  "plant-sentinel.png",
  "port-cargo.png",
  "port-skiff.png",
  "battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
  "rival-cutscene.png",
  "rival-fighter.png",
  "rival-racer.png",
  "route-beacon.png",
  "storm-bolt.png",
  "storm-drone.png",
  "storm-shot.png",
  "title-emblem.png",
  "oficina-cursor.png"
]);

export const VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT = Object.freeze(
  VERTICE_SPRITE_LIBRARY_4BPP_NAMES.map((name) => Object.freeze({
    source: `prepared/${name}`,
    name,
    destination: "sprites"
  }))
);

export const VERTICE_RACING_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-circuit-topdown.png",
    name: "circuit-topdown.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_NARRATIVE_ASSET_LAYOUT = Object.freeze([
  { name: "title-gba.png", destination: "backgrounds" },
  { name: "prologue-gba.png", destination: "backgrounds" },
  { name: "prologue-frame-1-gba.png", destination: "backgrounds" },
  { name: "prologue-frame-2-gba.png", destination: "backgrounds" },
  { name: "prologue-frame-3-gba.png", destination: "backgrounds" },
  { name: "port-lumen-gba.png", destination: "backgrounds" },
  { name: "route-map-gba.png", destination: "backgrounds" },
  { name: "title-emblem.png", destination: "sprites" },
  { name: "airship.png", destination: "sprites" },
  { name: "nara-topdown.png", destination: "sprites" },
  { name: "mechanic.png", destination: "sprites" },
  { name: "rival-cutscene.png", destination: "sprites" },
  { name: "port-cargo.png", destination: "sprites" },
  { name: "route-beacon.png", destination: "sprites" }
]);

export const VERTICE_PORT_LUMEN_ASSET_LAYOUT = Object.freeze([
  { source: "porto-lumen-v8/prepared/vertice-port-lumen-v8-gba.png", name: "port-lumen-gba.png", destination: "backgrounds" },
  { source: "../porto-player-scale-v3-32x64/prepared/nara/vertice-nara-topdown-32x64.png", name: "nara-topdown.png", destination: "sprites" },
  { source: "porto-lumen-v5/actors-v1/prepared/vertice-mechanic-topdown-v1.png", name: "mechanic.png", destination: "sprites" }
]);

export const VERTICE_PENEDOS_FULL_SCENE_ASSET_LAYOUT = Object.freeze([
  { source: "../vertice-circuito-dos-farois-v9/penedos-do-vento/layered-full-scene-v2/prepared/vertice-penedos-sky-sea-bg3-4bpp-v2.png", name: "penedos-sky-sea-bg3.png", destination: "backgrounds" },
  { source: "penedos-do-vento/layered-full-scene-v1/staging/vertice-penedos-terrain-bg2-480x160-v1.png", name: "penedos-terrain-bg2.png", destination: "backgrounds" },
  { source: "../vertice-circuito-dos-farois-v10/penedos-do-vento/layered-full-scene-v2/prepared/vertice-penedos-foreground-bg1-4bpp-v2.png", name: "penedos-foreground-bg1.png", destination: "backgrounds" }
]);

export const VERTICE_PENEDOS_PLATFORMER_LAYER_ASSET_LAYOUT = Object.freeze([
  {
    source: "porto-lume-platformer-v2-candidate/prepared/vertice-penedos-platformer-v2-gba.png",
    name: "penedos-platformer-v2-gba.png",
    destination: "backgrounds"
  },
  {
    source: "porto-lume-platformer-v2-candidate/prepared/vertice-nara-penedos-platformer-64x64.png",
    name: "nara-penedos-platformer-64x64.png",
    destination: "sprites"
  },
  {
    source: "porto-lume-platformer-v2-candidate/prepared/vertice-penedos-enemies-32x32.png",
    name: "penedos-enemies-32x32.png",
    destination: "sprites"
  }
]);

// Os assets do Mercado Suspenso são definidos pelo manifesto atual do projeto.
// Layouts antigos permanecem vazios para que a regeneração não os recopie.
export const VERTICE_MARKET_SUSPENSO_BACKGROUND_LAYOUT = Object.freeze([]);

// Atlas oficial do mundo isométrico. A folha visual é a fonte de montagem da
// cena: o runtime usa células lógicas 32×16 e slots visuais 32×32, sem
// substituir o mapa por um PNG composto de 240×160.
export const VERTICE_MARKET_SUSPENSO_TILESET_LAYOUT = Object.freeze([]);

export const VERTICE_MARKET_SUSPENSO_ACTOR_LAYOUT = Object.freeze([]);

export const VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT = Object.freeze([
  {
    source: "vertice-circuito-dos-farois-v5/oficina-nara/prepared/vertice-oficina-gba.png",
    name: "oficina-gba.png",
    destination: "backgrounds"
  },
  {
    source: "vertice-circuito-dos-farois-v5/oficina-nara/prepared/vertice-oficina-cursor.png",
    name: "oficina-cursor.png",
    destination: "sprites"
  },
  {
    source: "vertice-circuito-dos-farois-v5/oficina-nara/prepared/vertice-oficina-mechanic.png",
    name: "oficina-mechanic.png",
    destination: "sprites"
  },
  {
    source: "vertice-circuito-dos-farois-v5/oficina-nara/prepared/vertice-oficina-stabilizer.png",
    name: "oficina-stabilizer.png",
    destination: "sprites"
  }
]);

export const VERTICE_POINT_CLICK_CANDIDATE_ASSET_LAYOUT = Object.freeze([
  {
    source: "play-background-fidelity-v1-approved/prepared/armazem-das-mares-gba.png",
    name: "armazem-das-mares-gba.png",
    destination: "backgrounds"
  },
  {
    source: "play-background-fidelity-v1-approved/prepared/observatorio-do-farol-gba.png",
    name: "observatorio-do-farol-gba.png",
    destination: "backgrounds"
  },
  ...[
    "point-click-cursor.png",
    "point-click-lia-scroll.png",
    "point-click-dock-mechanic.png",
    "point-click-keeper-lantern.png",
    "point-click-chart-compass.png",
    "point-click-brass-lantern.png",
    "point-click-red-chest.png",
    "point-click-storm-lamp.png",
    "point-click-tide-gauge.png"
  ].map((name) => ({
    source: `exemplo-gba-point-and-click-v1-candidate/prepared/sprites/${name}`,
    name,
    destination: "sprites"
  }))
]);

export const VERTICE_TEMPESTADE_BASE_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "tempestade/composition-first-candidate-v15/prepared/vertice-tempestade-bg3-4bpp-v15.png",
    name: "storm-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_TEMPESTADE_AFFINE_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/shmup-background-affine-1024.png",
    name: "shmup-background-affine-1024.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_TITLE_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/title-bg-day-clouds-frame-00-4bpp.png",
    name: "title-gba.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/title-bg-day-clouds-frame-01-4bpp.png",
    name: "title-gba-frame-01.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/title-bg-day-clouds-frame-02-4bpp.png",
    name: "title-gba-frame-02.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_TITLE_LOGO_ACTOR_LAYOUT = Object.freeze([
  ...[
    "left-top-left", "left-top-right", "left-middle-left", "left-middle-right", "left-bottom-left", "left-bottom-right",
    "right-top-left", "right-top-right", "right-middle-left", "right-middle-right", "right-bottom-left", "right-bottom-right"
  ].map((id) => ({
    source: `prepared/title-logo-emblem-${id}.png`,
    name: `title-logo-emblem-${id}.png`,
    destination: "sprites"
  }))
]);

export const VERTICE_OPENING_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "abertura/primary-background-candidate-v4/prepared/vertice-opening-dawn-4bpp-v4.png",
    name: "opening-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_OPENING_ACTOR_ASSET_LAYOUT = Object.freeze([
  {
    source: "abertura/airship-candidate-v11/prepared/vertice-opening-airship-v11.png",
    name: "opening-airship.png",
    destination: "sprites"
  }
]);

export const VERTICE_APPROVED_SCENE_REFRESH_ASSET_LAYOUT = Object.freeze([
  {
    source: "prepared/backgrounds/opening-v2-background-240x160.png",
    name: "opening-v2-background-240x160.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/backgrounds/title-day-centered-240x160-4bpp.png",
    name: "title-day-centered-240x160-4bpp.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/backgrounds/porto-lume-shmup-wide-v3-local-banks.png",
    name: "porto-lume-shmup-wide-v3-local-banks.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/sprites/vertice-opening-airship.png",
    name: "opening-airship.png",
    destination: "sprites"
  },
  ...[
    "opening-v2-guardia-idle-48x64.png",
    "opening-v2-guardia-turn-48x64.png",
    "opening-v2-guardia-signal-48x64.png",
    "opening-v2-menino-24x32.png",
    "opening-v2-gaivota-24x16.png",
    "title-logo-actor-96x64.png",
    "press-start-actor-88x32.png",
    "tempestade-v3-player.png",
    "tempestade-v3-drone-horizontal.png",
    "tempestade-v3-drone-vertical.png",
    "tempestade-v3-boss-lighthouse.png"
  ].map((name) => ({
    source: `prepared/sprites/${name}`,
    name,
    destination: "sprites"
  }))
]);

export const VERTICE_INITIAL_MENU_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-menu-inicial-v3-gba.png",
    name: "menu-inicial-v3-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_GENDER_SELECTION_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-gender-selection-gba.png",
    name: "gender-selection-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_NEW_GAME_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-new-game-gba.png",
    name: "new-game-gba.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/vertice-name-input-bg-gba.png",
    name: "name-input-bg-gba.png",
    destination: "backgrounds"
  },
  {
    source: "prepared/vertice-name-input-keyboard-gba.png",
    name: "name-input-keyboard-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_NEW_GAME_ACTOR_LAYOUT = Object.freeze([
  "menu-gender-title.png",
  "menu-player-name-title.png",
  "menu-name-label.png",
  "menu-male.png",
  "menu-female.png",
  "menu-confirm.png",
  "menu-entry-back.png",
  "gender-player-male-32x64.png",
  "gender-player-female-32x64.png",
  "name-player-male-32x32.png",
  "name-player-female-32x32.png",
  "menu-entry-cursor.png"
].map((name) => ({
  source: `prepared/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_GENDER_SELECTION_ACTOR_LAYOUT = Object.freeze([
  {
    source: "prepared/male/vertice-player-male-32x64.png",
    name: "gender-player-male-32x64.png",
    destination: "sprites"
  },
  {
    source: "prepared/female/vertice-player-female-32x64.png",
    name: "gender-player-female-32x64.png",
    destination: "sprites"
  }
]);

export const VERTICE_LOAD_GAME_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-load-game-gba.png",
    name: "load-game-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_SAVE_GAME_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-save-game-gba.png",
    name: "save-game-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_START_MENU_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-menu-start-gba.png",
    name: "menu-start-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_MISSIONS_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-missoes-gba.png",
    name: "missoes-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_INVENTORY_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-inventario-gba.png",
    name: "inventario-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_MAP_HYBRID_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-mapa-hibrido-gba.png",
    name: "mapa-hibrido-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_PROFILE_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-perfil-equipe-gba.png",
    name: "perfil-equipe-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_LANGUAGE_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-idioma-gba.png",
    name: "idioma-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_SETTINGS_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-configuracoes-gba.png",
    name: "configuracoes-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_CREDITS_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/vertice-creditos-gba.png",
    name: "creditos-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_INITIAL_MENU_ACTOR_LAYOUT = Object.freeze([
  "menu-inicial-new-game.png",
  "menu-inicial-load-game.png",
  "menu-inicial-language.png",
  "menu-inicial-settings.png",
  "menu-inicial-credits.png",
  "menu-inicial-cursor.png"
].map((name) => ({
  source: `prepared/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_START_MENU_ACTOR_LAYOUT = Object.freeze([
  "menu-start-title.png",
  "menu-missoes.png",
  "menu-inventario.png",
  "menu-mapa.png",
  "menu-perfil-equipe.png",
  "menu-salvar.png",
  "menu-configuracoes.png",
  "menu-tactical.png"
].map((name) => ({
  source: `prepared/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_MISSIONS_ACTOR_LAYOUT = Object.freeze([
  "missoes-active.png",
  "missoes-next.png"
].map((name) => ({
  source: `prepared/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_INVENTORY_ACTOR_LAYOUT = Object.freeze([
  "inventario-modules.png",
  "inventario-empty.png"
].map((name) => ({
  source: `prepared/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_MAP_HYBRID_ACTOR_LAYOUT = Object.freeze([
  "mapa-detail-current.png",
  "mapa-detail-penedos.png"
].map((name) => ({
  source: `prepared/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_OFFICIAL_LOGO_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "prepared/gba-studio-logo-official-4bpp-v3.png",
    name: "gba-studio-logo-official-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_PROFILE_ACTOR_LAYOUT = Object.freeze([
  { source: "prepared/vertice-profile-nara.png", name: "profile-nara.png", destination: "sprites" },
  { source: "prepared/vertice-profile-guardian.png", name: "profile-guardian.png", destination: "sprites" },
  { source: "../conselho-guardia-v4/prepared/vertice-nara-portrait-v4.png", name: "nara-portrait.png", destination: "sprites" },
  { source: "../conselho-guardia-v4/prepared/vertice-guardian-portrait-v4.png", name: "guardian-portrait.png", destination: "sprites" }
]);

export const VERTICE_IN_GAME_MENU_BACKGROUND_LAYOUT = Object.freeze([
  ["menu-start-v3-hi-detail-gba.png", "menu-start-v3-hi-detail-gba.png"],
  ["missoes-v3-hi-detail-gba.png", "missoes-v3-hi-detail-gba.png"],
  ["inventario-v3-hi-detail-gba.png", "inventario-v3-hi-detail-gba.png"],
  ["mapa-menu-v3-hi-detail-gba.png", "mapa-menu-v3-hi-detail-gba.png"],
  ["perfil-equipe-v3-hi-detail-gba.png", "perfil-equipe-v3-hi-detail-gba.png"],
  ["save-game-v3-hi-detail-gba.png", "save-game-v3-hi-detail-gba.png"]
].map(([source, name]) => ({
  source: `prepared-gba/backgrounds/${source}`,
  name,
  destination: "backgrounds"
})));

export const VERTICE_IN_GAME_MENU_ACTOR_LAYOUT = Object.freeze([
  "menu-in-game-icons-v2.png",
  "nara-portrait-v3.png",
  "guardian-portrait-v3.png",
  "menu-back-v3.png"
].map((name) => ({
  source: `packed/${name.replace(/\.png$/, "")}/${name}`,
  name,
  destination: "sprites"
})));

export const VERTICE_PROLOGUE_BACKGROUND_LAYOUT = Object.freeze([
  { source: "exemplo-gba-prologo-storyboard-v3/prepared/vertice-prologue-frame-1-gba.png", name: "prologue-frame-1-gba.png", destination: "backgrounds" },
  { source: "exemplo-gba-prologo-storyboard-v3/prepared/vertice-prologue-frame-2-gba.png", name: "prologue-frame-2-gba.png", destination: "backgrounds" },
  { source: "exemplo-gba-prologo-storyboard-v3/prepared/vertice-prologue-frame-3-gba.png", name: "prologue-frame-3-gba.png", destination: "backgrounds" }
]);

export const VERTICE_ROUTE_MAP_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "mapa-rota/primary-background-candidate-v6/prepared/vertice-route-map-4bpp-v6.png",
    name: "route-map-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_ROUTE_MAP_ACTOR_LAYOUT = Object.freeze([
  {
    source: "../vertice-circuito-dos-farois-v12/sprite-library-4bpp/prepared/vertice-route-beacon.png",
    name: "route-beacon.png",
    destination: "sprites"
  }
]);

export const VERTICE_USINA_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "usina-submersa-v2/prepared/vertice-usina-submersa-v2-gba.png",
    name: "usina-submersa-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_USINA_ACTOR_LAYOUT = Object.freeze([
  {
    source: "usina-submersa-v2/actors/sentinel/prepared/vertice-usina-sentinel-v2.png",
    name: "usina-sentinel-v2.png",
    destination: "sprites"
  },
  {
    source: "usina-submersa-v2/actors/energy-cell/prepared/vertice-usina-energy-cell-v2.png",
    name: "usina-energy-cell-v2.png",
    destination: "sprites"
  }
]);

export const VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT = Object.freeze([
  {
    source: "../vertice-circuito-dos-farois-v13/dungeon-crawler-bg-v1/prepared/dungeon-crawler-bg-v1-4bpp.png",
    name: "dungeon-crawler-bg-v1.png",
    destination: "backgrounds"
  },
  {
    source: "../vertice-circuito-dos-farois-v13/dungeon-crawler-sentinel-v1/prepared/pack/dungeon-crawler-sentinel-v1.png",
    name: "dungeon-sentinel-v1.png",
    destination: "sprites"
  }
]);

export const VERTICE_COUNCIL_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "conselho-guardia-v3/prepared/vertice-council-gba-v3-runtime15.png",
    name: "council-gba.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT = Object.freeze([
  {
    source: "conselho-guardia-v4/prepared/vertice-nara-portrait-v4.png",
    name: "nara-portrait.png",
    destination: "sprites"
  },
  {
    source: "conselho-guardia-v4/prepared/vertice-guardian-portrait-v4.png",
    name: "guardian-portrait.png",
    destination: "sprites"
  },
  {
    source: "conselho-guardia-v4/prepared/vertice-dialogue-sigil-v4.png",
    name: "dialogue-sigil.png",
    destination: "sprites"
  }
]);

export const VERTICE_GUARDIAN_BACKGROUND_LAYOUT = Object.freeze([
  {
    source: "exemplo-gba-battle-rpg-v1-candidate/materialized/scene-copy-v2/Assets/backgrounds/battle-rpg-usina-nearest-review.png",
    name: "battle-rpg-usina-nearest-review.png",
    destination: "backgrounds"
  }
]);

export const VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT = Object.freeze([
  {
    source: "exemplo-gba-battle-rpg-v1-candidate/materialized/scene-copy-v2/Assets/sprites/battle-rpg-scene-party-mechanic-alpha128-v2.png",
    name: "battle-rpg-scene-party-mechanic-alpha128-v2.png",
    destination: "sprites"
  },
  {
    source: "exemplo-gba-battle-rpg-v1-candidate/materialized/scene-copy-v2/Assets/sprites/battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
    name: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
    destination: "sprites"
  }
]);

export const VERTICE_EXPLORATION_ASSET_LAYOUT = Object.freeze([]);

export const VERTICE_CLIMAX_ASSET_LAYOUT = Object.freeze([
  { name: "council-gba.png", destination: "backgrounds" },
  { name: "storm-gba.png", destination: "backgrounds" },
  { name: "shmup-background-affine-1024.png", destination: "backgrounds" },
  { name: "battle-rpg-usina-nearest-review.png", destination: "backgrounds" },
  { name: "arena-gba.png", destination: "backgrounds" },
  { name: "nara-portrait.png", destination: "sprites" },
  { name: "guardian-portrait.png", destination: "sprites" },
  { name: "dialogue-sigil.png", destination: "sprites" },
  { name: "nara-flight.png", destination: "sprites" },
  { name: "storm-drone.png", destination: "sprites" },
  { name: "storm-shot.png", destination: "sprites" },
  { name: "storm-bolt.png", destination: "sprites" },
  { name: "battle-rpg-scene-party-mechanic-alpha128-v2.png", destination: "sprites" },
  { name: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", destination: "sprites" },
  { name: "companion.png", destination: "sprites" },
  { name: "battle-ui.png", destination: "sprites" },
  { name: "nara-fighter.png", destination: "sprites" },
  { name: "rival-fighter.png", destination: "sprites" },
  { name: "fight-hud-v2-arena-bank-05.png", destination: "backgrounds" }
]);

const productionPseudo3dDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v2",
  "prepared",
  "pseudo3d"
);

const productionRacingBackgroundDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-racing-v2-candidate"
);

const productionNarrativeDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v2",
  "prepared",
  "narrative"
);

const productionExplorationDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v2",
  "prepared",
  "exploration"
);

const productionClimaxDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v2",
  "prepared",
  "climax"
);

const productionPortLumenDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3"
);

const productionShmupAffineDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "shmup-affine-background-v1"
);

const productionApprovedSceneRefreshDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-scene-refresh-v2-approved"
);

const productionTitleBackgroundDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-title-background-day-v1"
);

const productionTitleLogoDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-title-screen-v4-worked-lettering"
);

const productionControlledEntityDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "controlled-entity-pilots"
);

const productionLutaDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3"
);

const productionSpriteLibrary4bppDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v12",
  "sprite-library-4bpp"
);

const productionOfficialLogoDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-visual-rebuild-v1",
  "logo",
  "official-wordmark-candidate-v3"
);

const productionAssetsRootDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production"
);

const productionPenedosPlatformerActorDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "penedos-platformer-v2"
);

const productionInitialMenuBackgroundDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-menu-inicial-v3-reset-candidate"
);

const productionInGameMenuDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-in-game-menu-v1-hi-detail-approved"
);

const productionInGameMenuActorDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-in-game-menu-v2-actor-detail-approved"
);

const productionGenderSelectionBackgroundDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-menu-inicial-v3-reset-candidate"
);

const productionGenderSelectionActorDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-menu-inicial-v3-reset-candidate"
);

const productionNewGameBackgroundDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-menu-inicial-v3-reset-candidate"
);

const productionLoadGameBackgroundDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-load-game"
);

const productionSaveGameDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-save"
);

const productionStartMenuDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-start"
);

const productionMissionsDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-missoes"
);

const productionInventoryDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-inventario"
);

const productionMapHybridDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-mapa-hibrido"
);

const productionProfileDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-perfil-equipe"
);

const productionLanguageDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-idioma"
);

const productionSettingsDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-configuracoes"
);

const productionCreditsDirectory = path.resolve(
  electronRoot,
  "..",
  "..",
  "tools",
  "gba-sprite-prep",
  "production",
  "vertice-circuito-dos-farois-v3",
  "menu-creditos"
);

async function copyAssetSet(projectPath, sourceDirectory, assets) {
  if (!projectPath) return [];
  const projectDirectory = path.dirname(projectPath);
  const declaredAssetSources = await readAssetSyncManifest(projectPath);
  const copied = [];
  for (const asset of assets) {
    const destinationName = asset.name.replace(/^vertice-/, "");
    const destinationSource = `Assets/${asset.destination}/${destinationName}`;
    if (declaredAssetSources && !declaredAssetSources.has(destinationSource)) continue;
    const sourceRelativePaths = [asset.source ?? asset.name];
    if (asset.source && path.basename(asset.source).startsWith("vertice-")) {
      sourceRelativePaths.push(path.join(
        path.dirname(asset.source),
        path.basename(asset.source).replace(/^vertice-/, "")
      ));
    }
    if (!asset.source && !asset.name.startsWith("vertice-")) {
      sourceRelativePaths.push(`vertice-${asset.name}`);
    }
    let source;
    let sourceError;
    for (const sourceRelativePath of sourceRelativePaths) {
      const candidate = path.join(sourceDirectory, sourceRelativePath);
      try {
        await access(candidate);
        source = candidate;
        break;
      } catch (error) {
        sourceError = error;
      }
    }
    if (!source) throw sourceError;
    const destination = path.join(projectDirectory, "Assets", asset.destination, destinationName);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    copied.push(destination);
  }
  return copied;
}

export async function syncVerticePortLumenAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_PORT_LUMEN_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_PORT_LUMEN_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeControlledEntityAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionControlledEntityDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_CONTROLLED_ENTITY_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeLutaAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionLutaDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_LUTA_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_LUTA_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeSpriteLibrary4bppAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionSpriteLibrary4bppDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_SPRITE_LIBRARY_4BPP_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticePenedosLayeredAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_PENEDOS_FULL_SCENE_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_PENEDOS_FULL_SCENE_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticePenedosPlatformerLayerAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_PENEDOS_PLATFORMER_LAYER_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_PENEDOS_PLATFORMER_LAYER_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticePenedosPlatformerActorAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPenedosPlatformerActorDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_PENEDOS_PLATFORMER_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_PENEDOS_PLATFORMER_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeMarketSuspensoBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_MARKET_SUSPENSO_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_MARKET_SUSPENSO_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeMarketSuspensoTileset({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_MARKET_SUSPENSO_TILESET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_MARKET_SUSPENSO_TILESET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeMarketSuspensoActors({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_MARKET_SUSPENSO_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_MARKET_SUSPENSO_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeOficinaPointClickAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT)
  ]);
  await Promise.all([
    rm(path.join(path.dirname(templateProjectPath), "Assets", "backgrounds", "workshop-gba.png"), { force: true }),
    rm(path.join(path.dirname(fixtureProjectPath), "Assets", "backgrounds", "workshop-gba.png"), { force: true }),
    rm(path.join(path.dirname(templateProjectPath), "Assets", "backgrounds", "oficina-bg3-harbor-wall.png"), { force: true }),
    rm(path.join(path.dirname(templateProjectPath), "Assets", "backgrounds", "oficina-bg2-workbench.png"), { force: true }),
    rm(path.join(path.dirname(templateProjectPath), "Assets", "backgrounds", "oficina-bg1-foreground.png"), { force: true }),
    rm(path.join(path.dirname(fixtureProjectPath), "Assets", "backgrounds", "oficina-bg3-harbor-wall.png"), { force: true }),
    rm(path.join(path.dirname(fixtureProjectPath), "Assets", "backgrounds", "oficina-bg2-workbench.png"), { force: true }),
    rm(path.join(path.dirname(fixtureProjectPath), "Assets", "backgrounds", "oficina-bg1-foreground.png"), { force: true })
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticePointClickCandidateAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_POINT_CLICK_CANDIDATE_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_POINT_CLICK_CANDIDATE_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeTempestadeBaseBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_TEMPESTADE_BASE_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_TEMPESTADE_BASE_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeTempestadeAffineBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionShmupAffineDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_TEMPESTADE_AFFINE_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_TEMPESTADE_AFFINE_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeTitleBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionTitleBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_TITLE_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_TITLE_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeTitleLogoActors({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionTitleLogoDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_TITLE_LOGO_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_TITLE_LOGO_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeOpeningBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_OPENING_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_OPENING_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeOpeningActor({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_OPENING_ACTOR_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_OPENING_ACTOR_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeApprovedSceneRefreshAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionApprovedSceneRefreshDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_APPROVED_SCENE_REFRESH_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_APPROVED_SCENE_REFRESH_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeOfficialLogoBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionOfficialLogoDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_OFFICIAL_LOGO_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_OFFICIAL_LOGO_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticePrologueBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_PROLOGUE_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_PROLOGUE_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeRouteMapBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, [
      ...VERTICE_ROUTE_MAP_BACKGROUND_LAYOUT,
      ...VERTICE_ROUTE_MAP_ACTOR_LAYOUT
    ]),
    copyAssetSet(fixtureProjectPath, sourceDirectory, [
      ...VERTICE_ROUTE_MAP_BACKGROUND_LAYOUT,
      ...VERTICE_ROUTE_MAP_ACTOR_LAYOUT
    ])
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeUsinaBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_USINA_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_USINA_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeUsinaActors({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_USINA_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_USINA_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeDungeonCrawlerV1Assets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeCouncilBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_COUNCIL_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_COUNCIL_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeCouncilActorAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionPortLumenDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeGuardianBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_GUARDIAN_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_GUARDIAN_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeBattleRpgActorAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionAssetsRootDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeRacingBackgrounds({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionRacingBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_RACING_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_RACING_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeRacingAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionRacingBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_RACING_ASSET_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_RACING_ASSET_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeShowcaseAssets({
  templateProjectPath: _templateProjectPath,
  fixtureProjectPath: _fixtureProjectPath,
  sourceDirectory: _sourceDirectory = productionPseudo3dDirectory,
  narrativeSourceDirectory: _narrativeSourceDirectory = productionNarrativeDirectory,
  explorationSourceDirectory: _explorationSourceDirectory = productionExplorationDirectory,
  climaxSourceDirectory: _climaxSourceDirectory = productionClimaxDirectory,
  includeRacingBackgrounds: _includeRacingBackgrounds = true
}) {
  throw new Error(
    "A biblioteca visual legada de Vértice foi arquivada; use sincronizações focadas para cenas aprovadas."
  );
}

export async function syncVerticeInitialMenuBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionInitialMenuBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_INITIAL_MENU_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_INITIAL_MENU_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeGenderSelectionBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionGenderSelectionBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_GENDER_SELECTION_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_GENDER_SELECTION_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeGenderSelectionActors({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionGenderSelectionActorDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_GENDER_SELECTION_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_GENDER_SELECTION_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeNewGameBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionNewGameBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_NEW_GAME_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_NEW_GAME_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeNewGameActors({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionNewGameBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_NEW_GAME_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_NEW_GAME_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeLoadGameBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionLoadGameBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_LOAD_GAME_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_LOAD_GAME_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeSaveGameBackground({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionSaveGameDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_SAVE_GAME_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_SAVE_GAME_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeStartMenuAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionStartMenuDirectory
}) {
  const layout = [...VERTICE_START_MENU_BACKGROUND_LAYOUT, ...VERTICE_START_MENU_ACTOR_LAYOUT];
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, layout),
    copyAssetSet(fixtureProjectPath, sourceDirectory, layout)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeMissionsAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionMissionsDirectory
}) {
  const layout = [...VERTICE_MISSIONS_BACKGROUND_LAYOUT, ...VERTICE_MISSIONS_ACTOR_LAYOUT];
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, layout),
    copyAssetSet(fixtureProjectPath, sourceDirectory, layout)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeInventoryAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionInventoryDirectory
}) {
  const layout = [...VERTICE_INVENTORY_BACKGROUND_LAYOUT, ...VERTICE_INVENTORY_ACTOR_LAYOUT];
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, layout),
    copyAssetSet(fixtureProjectPath, sourceDirectory, layout)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeMapHybridAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionMapHybridDirectory
}) {
  const layout = [...VERTICE_MAP_HYBRID_BACKGROUND_LAYOUT, ...VERTICE_MAP_HYBRID_ACTOR_LAYOUT];
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, layout),
    copyAssetSet(fixtureProjectPath, sourceDirectory, layout)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeProfileAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionProfileDirectory
}) {
  const layout = [...VERTICE_PROFILE_BACKGROUND_LAYOUT, ...VERTICE_PROFILE_ACTOR_LAYOUT];
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, layout),
    copyAssetSet(fixtureProjectPath, sourceDirectory, layout)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeInGameMenuAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionInGameMenuDirectory,
  actorSourceDirectory = sourceDirectory === productionInGameMenuDirectory
    ? productionInGameMenuActorDirectory
    : sourceDirectory
}) {
  const [templateBackgrounds, fixtureBackgrounds, templateActors, fixtureActors] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_IN_GAME_MENU_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_IN_GAME_MENU_BACKGROUND_LAYOUT),
    copyAssetSet(templateProjectPath, actorSourceDirectory, VERTICE_IN_GAME_MENU_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, actorSourceDirectory, VERTICE_IN_GAME_MENU_ACTOR_LAYOUT)
  ]);
  const templateAssets = [...templateBackgrounds, ...templateActors];
  const fixtureAssets = [...fixtureBackgrounds, ...fixtureActors];
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeLanguageAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionLanguageDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_LANGUAGE_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_LANGUAGE_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeSettingsAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionSettingsDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_SETTINGS_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_SETTINGS_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeCreditsAssets({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionCreditsDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_CREDITS_BACKGROUND_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_CREDITS_BACKGROUND_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}

export async function syncVerticeInitialMenuActors({
  templateProjectPath,
  fixtureProjectPath,
  sourceDirectory = productionInitialMenuBackgroundDirectory
}) {
  const [templateAssets, fixtureAssets] = await Promise.all([
    copyAssetSet(templateProjectPath, sourceDirectory, VERTICE_INITIAL_MENU_ACTOR_LAYOUT),
    copyAssetSet(fixtureProjectPath, sourceDirectory, VERTICE_INITIAL_MENU_ACTOR_LAYOUT)
  ]);
  return { templateAssets, fixtureAssets };
}
