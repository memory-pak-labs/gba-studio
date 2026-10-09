import type { GBAProjectData } from "./projectFile.js";
import {
  buildScenePreflightReport,
  type ScenePreflightAssetStatus,
  type ScenePreflightIssue,
  type ScenePreflightReport,
  type ScenePreflightStatus
} from "./scenePreflight.js";

export const COMPLETE_PROJECT_FIXTURE_SCHEMA = 1 as const;
export const COMPLETE_PROJECT_FIXTURE_REGISTRY = "gba-studio-complete-structural-fixture" as const;
export const COMPLETE_PROJECT_FIXTURE_MODE = "structural" as const;

export type CompleteProjectFixtureStatus = "complete" | "review" | "blocked";
export type CompleteProjectFixtureRole =
  | "background"
  | "player"
  | "actors"
  | "hud"
  | "obstacles"
  | "collision"
  | "dialogue_font"
  | "tileset"
  | "music";

export interface CompleteProjectFixtureMarker {
  schema: typeof COMPLETE_PROJECT_FIXTURE_SCHEMA;
  registry: typeof COMPLETE_PROJECT_FIXTURE_REGISTRY;
  mode: typeof COMPLETE_PROJECT_FIXTURE_MODE;
  source: "canonical-template";
  productionReady: false;
}

export interface CompleteProjectFixtureResolvedAsset {
  role: CompleteProjectFixtureRole;
  reference: string;
  kind: string;
  source: "existing-project" | "fixture-data";
  productionReady: false;
}

export interface CompleteProjectFixtureScene {
  name: string;
  sceneType: string;
  profileId: string;
  productionStatus: ScenePreflightStatus;
  structuralStatus: CompleteProjectFixtureStatus;
  productionReady: false;
  placeholderRoles: CompleteProjectFixtureRole[];
  resolvedLayers: string[];
  resolvedAssets: CompleteProjectFixtureResolvedAsset[];
  verification: {
    tests: string[];
    evidence: string[];
  };
  issues: Array<Pick<ScenePreflightIssue, "code" | "severity" | "message">>;
}

export interface CompleteProjectFixtureManifest {
  schema: typeof COMPLETE_PROJECT_FIXTURE_SCHEMA;
  registry: typeof COMPLETE_PROJECT_FIXTURE_REGISTRY;
  mode: typeof COMPLETE_PROJECT_FIXTURE_MODE;
  source: "canonical-template";
  productionReady: false;
  status: CompleteProjectFixtureStatus;
  sceneCount: number;
  scenes: CompleteProjectFixtureScene[];
}

export interface CompleteProjectFixtureResult {
  data: GBAProjectData;
  manifest: CompleteProjectFixtureManifest;
}

export interface CompleteProjectFixtureValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ExportedCompleteProjectFixtureManifest {
  schema: typeof COMPLETE_PROJECT_FIXTURE_SCHEMA;
  registry: typeof COMPLETE_PROJECT_FIXTURE_REGISTRY;
  mode: typeof COMPLETE_PROJECT_FIXTURE_MODE;
  source: "canonical-template";
  production_ready: false;
  status: CompleteProjectFixtureStatus;
  scene_count: number;
  scenes: Array<{
    name: string;
    scene_type: string;
    profile_id: string;
    production_status: ScenePreflightStatus;
    structural_status: CompleteProjectFixtureStatus;
    production_ready: false;
    placeholder_roles: CompleteProjectFixtureRole[];
    resolved_layers: string[];
    resolved_assets: Array<{
      role: CompleteProjectFixtureRole;
      reference: string;
      kind: string;
      source: "existing-project" | "fixture-data";
      production_ready: false;
    }>;
    verification: {
      tests: string[];
      evidence: string[];
    };
    issues: Array<Pick<ScenePreflightIssue, "code" | "severity" | "message">>;
  }>;
}

interface RecordValue {
  [key: string]: unknown;
}

interface FixtureRoleState {
  roles: Set<CompleteProjectFixtureRole>;
}

const preferredBackgroundsByProfile: Record<string, string[]> = {
  topdown: ["porto-lume-exterior-topdown-gba.png"],
  platformer: ["penedos-platformer-v8.png"],
  isometric: ["mercado-adventure-surface.png"],
  dungeonCrawler: ["usina-exploration-background-v3-4bpp.png"],
  racing: ["circuit-final-loop-v2-runtime.png"],
  pointAndClick: ["observatorio-do-farol-gba.png"],
  shmup: ["porto-lume-shmup-wide-v3.png"],
  visualNovel: ["council-v5-background.png"],
  menu: ["menu-inicial-v3-gba.png"],
  cutscene: ["opening-v4-per-tile-14-banks.png"],
  worldMap: ["route-map-paged-v2.png"],
  battleRpg: ["battle-rpg-usina-nearest-review.png"],
  luta: ["arena-gba.png"],
  puzzle: ["mercado-adventure-surface.png"],
  bossBattle: ["arena-gba.png"],
  tacticalGrid: ["tactical-v5-surface.png"],
  hybrid: ["port-lumen-gba.png"],
  custom: ["port-lumen-gba.png"]
};

const preferredPlayerSpritesByProfile: Record<string, string[]> = {
  topdown: ["nara-topdown.png"],
  platformer: ["penedos-v7-player.png"],
  isometric: ["tactical-nara-v5.png"],
  dungeonCrawler: ["player-pilot-32x32.png"],
  racing: ["nara-racer.png"],
  pointAndClick: ["point-click-cursor.png"],
  shmup: ["tempestade-v3-player.png"],
  visualNovel: ["nara-portrait.png"],
  menu: ["nara-topdown.png"],
  cutscene: ["opening-v3-menino-24x32.png"],
  worldMap: ["route-airship-v2.png"],
  battleRpg: ["battle-rpg-scene-party-mechanic-alpha128-v2.png"],
  luta: ["nara-fighter.png"],
  puzzle: ["nara-topdown.png"],
  bossBattle: ["battle-rpg-scene-party-mechanic-alpha128-v2.png", "nara-fighter.png"],
  tacticalGrid: ["tactical-nara-v5.png"],
  hybrid: ["nara-topdown.png"],
  custom: ["nara-topdown.png"]
};

const preferredActorSpritesByProfile: Record<string, string[]> = {
  topdown: ["mechanic-pilot-32x32.png", "nara-topdown.png"],
  platformer: ["penedos-v7-crab.png", "penedos-v7-moth.png", "penedos-v7-slime.png", "penedos-v7-npc.png"],
  isometric: ["market-adventure-merchant.png", "market-adventure-guard.png", "tactical-nara-v5.png"],
  dungeonCrawler: ["sentinel-depth-far-mid-near-192x64-v3-4bpp.png", "mechanic-pilot-32x32.png"],
  racing: ["rival-racer.png", "nara-racer.png"],
  pointAndClick: ["point-click-dock-mechanic.png", "point-click-keeper-lantern.png", "point-click-lia-scroll.png"],
  shmup: ["tempestade-v3-drone-horizontal.png", "tempestade-v3-drone-vertical.png", "tempestade-v3-boss-lighthouse.png"],
  visualNovel: ["council-v5-guardian.png", "council-v5-nara.png"],
  menu: ["menu-inicial-cursor.png"],
  cutscene: ["opening-v3-guardia-idle-48x64.png", "opening-v3-menino-24x32.png", "opening-v3-gaivota-24x16.png"],
  worldMap: ["route-airship-v2.png"],
  battleRpg: ["battle-rpg-scene-enemy-large-robot-alpha128-v2.png", "battle-rpg-scene-party-mechanic-alpha128-v2.png"],
  luta: ["rival-fighter.png", "nara-fighter.png"],
  puzzle: ["nara-topdown.png"],
  bossBattle: ["battle-rpg-scene-enemy-large-robot-alpha128-v2.png", "rival-fighter.png"],
  tacticalGrid: ["market-adventure-merchant.png", "market-adventure-guard.png", "tactical-nara-v5.png"],
  hybrid: ["mechanic.png", "nara-topdown.png"],
  custom: ["mechanic.png", "nara-topdown.png"]
};

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function integerValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function sceneName(scene: RecordValue | undefined, fallback = "Cena ativa"): string {
  return stringValue(scene?.name) ?? stringValue(scene?.id) ?? fallback;
}

function sceneType(scene: RecordValue | undefined): string {
  const runtime = isRecord(scene?.runtime) ? scene.runtime : undefined;
  return stringValue(scene?.sceneType) ?? stringValue(scene?.type) ?? stringValue(runtime?.type) ?? "topdown";
}

function sceneCollections(data: GBAProjectData): RecordValue[][] {
  return [records(data.scenas), records(data.rooms)].filter((collection) => collection.length > 0);
}

function scenesForName(data: GBAProjectData, name: string): RecordValue[] {
  return sceneCollections(data).flatMap((collection) => collection.filter((scene) => sceneName(scene) === name));
}

function projectAssets(data: GBAProjectData): RecordValue[] {
  return records(data.assets);
}

function assetReference(asset: RecordValue | undefined): string | null {
  return stringValue(asset?.name) ?? stringValue(asset?.id);
}

function assetMatchesKind(asset: RecordValue, kinds: string[]): boolean {
  if (kinds.length === 0) return true;
  const kind = stringValue(asset.kind)?.toLowerCase() ?? "";
  return kinds.some((candidate) => kind.includes(candidate.toLowerCase()));
}

function findExistingAsset(data: GBAProjectData, preferred: string[], kinds: string[]): RecordValue | undefined {
  const assets = projectAssets(data);
  for (const candidate of preferred) {
    const exact = assets.find((asset) => (
      assetMatchesKind(asset, kinds)
      && (stringValue(asset.name) === candidate || stringValue(asset.id) === candidate)
    ));
    if (exact) return exact;
  }
  return assets.find((asset) => assetMatchesKind(asset, kinds));
}

function assetExists(data: GBAProjectData, reference: string | null): boolean {
  if (!reference) return false;
  return projectAssets(data).some((asset) => assetReference(asset) === reference || stringValue(asset.id) === reference);
}

function actorHasSprite(actor: RecordValue): boolean {
  return Boolean(
    stringValue(actor.spriteSheet)
    ?? stringValue(actor.animationName)
    ?? stringValue(actor.animation)
    ?? stringValue(actor.spriteSource)
  );
}

function actorSpriteExists(data: GBAProjectData, actor: RecordValue): boolean {
  const sprite = stringValue(actor.spriteSheet);
  return actorHasSprite(actor) && (!sprite || assetExists(data, sprite));
}

function actorsForScene(data: GBAProjectData, name: string): RecordValue[] {
  return records(data.actors).filter((actor) => (
    stringValue(actor.roomName) === name
    || stringValue(actor.sceneName) === name
    || stringValue(actor.room) === name
  ));
}

function fixtureSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "scene";
}

function uniqueActorIdentity(data: GBAProjectData, scene: string, role: string): { id: string; name: string } {
  const slug = fixtureSlug(scene);
  const actors = records(data.actors);
  const existingIDs = new Set(actors.map((actor) => stringValue(actor.id)).filter((value): value is string => Boolean(value)));
  const existingNames = new Set(actors.map((actor) => stringValue(actor.name)).filter((value): value is string => Boolean(value)));
  const base = `fixture-${slug}-${role}`;
  let suffix = 1;
  let id = base;
  let name = `Fixture · ${scene} · ${role}`;
  while (existingIDs.has(id) || existingNames.has(name)) {
    suffix += 1;
    id = `${base}-${suffix}`;
    name = `Fixture · ${scene} · ${role} ${suffix}`;
  }
  return { id, name };
}

function preferredSprites(profileId: string, role: "player" | "actors"): string[] {
  const table = role === "player" ? preferredPlayerSpritesByProfile : preferredActorSpritesByProfile;
  return table[profileId] ?? table.custom;
}

function reusableActor(data: GBAProjectData, profileId: string, role: "player" | "actors"): RecordValue | undefined {
  const actors = records(data.actors).filter((actor) => !isRecord(actor.fixture) && actorSpriteExists(data, actor));
  const preferred = preferredSprites(profileId, role);
  for (const sprite of preferred) {
    const exact = actors.find((actor) => stringValue(actor.spriteSheet) === sprite);
    if (exact) return exact;
  }
  return actors[0];
}

function addFixtureActor(
  data: GBAProjectData,
  scene: RecordValue,
  profileId: string,
  role: "player" | "actors"
): RecordValue | undefined {
  const source = reusableActor(data, profileId, role);
  if (!source) return undefined;
  const sceneNameValue = sceneName(scene);
  const identity = uniqueActorIdentity(data, sceneNameValue, role);
  const width = Math.max(1, integerValue(scene.width, 30));
  const height = Math.max(1, integerValue(scene.height, 20));
  const actor = clone(source);
  actor.id = identity.id;
  actor.name = identity.name;
  actor.roomName = sceneNameValue;
  delete actor.sceneName;
  delete actor.room;
  actor.x = Math.min(4, Math.max(0, width - 1));
  actor.y = Math.min(4, Math.max(0, height - 1));
  actor.fixture = {
    schema: COMPLETE_PROJECT_FIXTURE_SCHEMA,
    registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
    mode: COMPLETE_PROJECT_FIXTURE_MODE,
    role,
    productionReady: false
  };
  const actorList = Array.isArray(data.actors) ? data.actors : [];
  actorList.push(actor);
  data.actors = actorList;
  return actor;
}

function runtimeConfig(scene: RecordValue): RecordValue {
  const runtime = isRecord(scene.runtime) ? scene.runtime : undefined;
  if (isRecord(runtime?.config)) return runtime.config;
  return isRecord(scene.config) ? scene.config : {};
}

function isAffineScene(scene: RecordValue): boolean {
  const config = runtimeConfig(scene);
  return isRecord(config.affine) && config.affine.enabled === true;
}

function backgroundReferenceForScene(data: GBAProjectData, scene: RecordValue, profileId: string): string | null {
  const preferred = isAffineScene(scene)
    ? ["affine-showcase-gba.png", ...(preferredBackgroundsByProfile[profileId] ?? [])]
    : preferredBackgroundsByProfile[profileId] ?? preferredBackgroundsByProfile.custom;
  return assetReference(findExistingAsset(data, preferred, ["background", "bg", "tileset"]));
}

function hudPresetReference(data: GBAProjectData): string | null {
  const settings = isRecord(data.settings) ? data.settings : {};
  const presets = records(settings.hudPresets);
  const defaultPreset = presets.find((preset) => stringValue(preset.id) === "hud-default") ?? presets[0];
  return stringValue(defaultPreset?.id) ?? stringValue(defaultPreset?.name);
}

function addPlaceholderHud(scene: RecordValue, data: GBAProjectData): boolean {
  const preset = hudPresetReference(data);
  if (preset) {
    scene.hudPresetId = preset;
    return true;
  }
  scene.hud = {
    id: `fixture-${fixtureSlug(sceneName(scene))}-hud`,
    enabled: false,
    placeholder: true,
    fixture: {
      schema: COMPLETE_PROJECT_FIXTURE_SCHEMA,
      registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
      mode: COMPLETE_PROJECT_FIXTURE_MODE,
      role: "hud",
      productionReady: false
    }
  };
  return true;
}

function addPlaceholderObstacle(scene: RecordValue): boolean {
  const existing = records(scene.obstacles);
  if (existing.length > 0) return true;
  scene.obstacles = [{
    id: `fixture-${fixtureSlug(sceneName(scene))}-obstacle`,
    name: "Fixture obstacle",
    type: "solid",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    enabled: false,
    placeholder: true,
    fixture: {
      schema: COMPLETE_PROJECT_FIXTURE_SCHEMA,
      registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
      mode: COMPLETE_PROJECT_FIXTURE_MODE,
      role: "obstacles",
      productionReady: false
    }
  }];
  return true;
}

function addPlaceholderCollision(scene: RecordValue, report: ScenePreflightReport): boolean {
  if (report.collision.declared) return true;
  const width = integerValue(scene.width, 0);
  const height = integerValue(scene.height, 0);
  if (width <= 0 || height <= 0) return false;
  const existing = Array.isArray(scene.collisionTypes)
    ? scene.collisionTypes.filter((value): value is string => typeof value === "string")
    : [];
  scene.collisionTypes = Array.from({ length: width * height }, (_, index) => existing[index] ?? "free");
  return true;
}

function addSceneField(scenes: RecordValue[], key: string, value: unknown): void {
  for (const scene of scenes) scene[key] = clone(value);
}

function addSceneActor(data: GBAProjectData, scenes: RecordValue[], profileId: string, role: "player" | "actors"): RecordValue | undefined {
  const actor = addFixtureActor(data, scenes[0], profileId, role);
  if (!actor) return undefined;
  return actor;
}

function roleForAsset(asset: ScenePreflightAssetStatus): CompleteProjectFixtureRole | null {
  switch (asset.reference) {
    case "background": return "background";
    case "player_actor": return "player";
    case "actor_sprite": return "actors";
    case "collision_meta_grid": return "collision";
    case "dialogue_font": return "dialogue_font";
    case "tileset": return "tileset";
    case "music": return "music";
    default: return null;
  }
}

function addRole(state: FixtureRoleState, role: CompleteProjectFixtureRole): void {
  state.roles.add(role);
}

function applySceneFixture(
  data: GBAProjectData,
  name: string,
  productionReport: ScenePreflightReport,
  state: FixtureRoleState
): void {
  const scenes = scenesForName(data, name);
  const scene = scenes[0];
  if (!scene) return;

  const requiredMissingAssets = productionReport.assets.filter((asset) => asset.required && asset.state === "missing");
  for (const asset of requiredMissingAssets) {
    const role = roleForAsset(asset);
    if (role) addRole(state, role);
  }

  const backgroundMissing = requiredMissingAssets.some((asset) => asset.reference === "background");
  if (backgroundMissing) {
    const background = backgroundReferenceForScene(data, scene, productionReport.profileId);
    if (background) addSceneField(scenes, "backgroundAssetName", background);
  }

  const hudMissing = productionReport.layers.some((layer) => layer.required && layer.role === "hud" && !layer.present);
  if (hudMissing) {
    addRole(state, "hud");
    addPlaceholderHud(scene, data);
    for (const duplicate of scenes.slice(1)) {
      if (scene.hudPresetId !== undefined) duplicate.hudPresetId = scene.hudPresetId;
      if (scene.hud !== undefined) duplicate.hud = clone(scene.hud);
    }
  }

  const obstaclesMissing = productionReport.layers.some((layer) => layer.required && layer.role === "obstacles" && !layer.present);
  if (obstaclesMissing) {
    addRole(state, "obstacles");
    addPlaceholderObstacle(scene);
    for (const duplicate of scenes.slice(1)) duplicate.obstacles = clone(scene.obstacles);
  }

  if (productionReport.collision.required && !productionReport.collision.declared) {
    addRole(state, "collision");
    if (addPlaceholderCollision(scene, productionReport)) {
      for (const duplicate of scenes.slice(1)) duplicate.collisionTypes = clone(scene.collisionTypes);
    }
  }

  const playerMissing = productionReport.player.required && !productionReport.player.present;
  if (playerMissing) {
    addRole(state, "player");
    const actor = addSceneActor(data, scenes, productionReport.profileId, "player");
    if (actor) addSceneField(scenes, "playerActorName", actor.name);
  }

  const actorsMissing = (
    productionReport.actors.required && productionReport.actors.count === 0
  ) || requiredMissingAssets.some((asset) => asset.reference === "actor_sprite");
  if (actorsMissing) {
    addRole(state, "actors");
    const hasFixtureActor = actorsForScene(data, name).some((actor) => isRecord(actor.fixture) && actorHasSprite(actor));
    if (!hasFixtureActor) addSceneActor(data, scenes, productionReport.profileId, "actors");
  }
}

function structuralStatus(status: ScenePreflightStatus): CompleteProjectFixtureStatus {
  if (status === "ready") return "complete";
  return status;
}

function manifestAsset(
  asset: ScenePreflightAssetStatus,
  placeholderRoles: Set<CompleteProjectFixtureRole>
): CompleteProjectFixtureResolvedAsset | null {
  const role = roleForAsset(asset);
  if (!role || !asset.present) return null;
  return {
    role,
    reference: asset.resolvedReference ?? asset.id,
    kind: asset.kind,
    source: placeholderRoles.has(role) ? "fixture-data" : "existing-project",
    productionReady: false
  };
}

function fixtureScene(
  productionReport: ScenePreflightReport,
  structuralReport: ScenePreflightReport,
  state: FixtureRoleState
): CompleteProjectFixtureScene {
  const resolvedAssets = structuralReport.assets
    .filter((asset) => asset.required || asset.present)
    .map((asset) => manifestAsset(asset, state.roles))
    .filter((asset): asset is CompleteProjectFixtureResolvedAsset => Boolean(asset));
  return {
    name: productionReport.sceneName,
    sceneType: productionReport.sceneType,
    profileId: productionReport.profileId,
    productionStatus: productionReport.status,
    structuralStatus: structuralStatus(structuralReport.status),
    productionReady: false,
    placeholderRoles: Array.from(state.roles),
    resolvedLayers: structuralReport.layers.filter((layer) => layer.present).map((layer) => layer.id),
    resolvedAssets,
    verification: {
      tests: [...structuralReport.verification.tests],
      evidence: [...structuralReport.verification.evidence]
    },
    issues: structuralReport.issues.map((item) => ({
      code: item.code,
      severity: item.severity,
      message: item.message
    }))
  };
}

function overallStatus(scenes: CompleteProjectFixtureScene[]): CompleteProjectFixtureStatus {
  if (scenes.some((scene) => scene.structuralStatus === "blocked")) return "blocked";
  if (scenes.some((scene) => scene.structuralStatus === "review")) return "review";
  return "complete";
}

function fixtureMarker(): CompleteProjectFixtureMarker {
  return {
    schema: COMPLETE_PROJECT_FIXTURE_SCHEMA,
    registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
    mode: COMPLETE_PROJECT_FIXTURE_MODE,
    source: "canonical-template",
    productionReady: false
  };
}

export function buildCompleteProjectFixture(source: GBAProjectData): CompleteProjectFixtureResult {
  const data = clone(source);
  data.fixture = fixtureMarker();
  const sourceScenes = sceneCollections(source).flatMap((collection) => collection);
  const names = Array.from(new Set(sourceScenes.map((scene, index) => sceneName(scene, `scene_${index + 1}`))));
  const roleStates = new Map<string, FixtureRoleState>(names.map((name) => [name, { roles: new Set() }]));
  const productionReports = names.map((name) => buildScenePreflightReport(source, name));

  for (const report of productionReports) {
    applySceneFixture(data, report.sceneName, report, roleStates.get(report.sceneName) ?? { roles: new Set() });
  }

  const scenes = productionReports.map((productionReport) => {
    const structuralReport = buildScenePreflightReport(data, productionReport.sceneName);
    return fixtureScene(
      productionReport,
      structuralReport,
      roleStates.get(productionReport.sceneName) ?? { roles: new Set() }
    );
  });
  return {
    data,
    manifest: {
      schema: COMPLETE_PROJECT_FIXTURE_SCHEMA,
      registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
      mode: COMPLETE_PROJECT_FIXTURE_MODE,
      source: "canonical-template",
      productionReady: false,
      status: overallStatus(scenes),
      sceneCount: scenes.length,
      scenes
    }
  };
}

export function exportCompleteProjectFixtureManifest(
  manifest: CompleteProjectFixtureManifest
): ExportedCompleteProjectFixtureManifest {
  return {
    schema: manifest.schema,
    registry: manifest.registry,
    mode: manifest.mode,
    source: manifest.source,
    production_ready: false,
    status: manifest.status,
    scene_count: manifest.sceneCount,
    scenes: manifest.scenes.map((scene) => ({
      name: scene.name,
      scene_type: scene.sceneType,
      profile_id: scene.profileId,
      production_status: scene.productionStatus,
      structural_status: scene.structuralStatus,
      production_ready: false,
      placeholder_roles: [...scene.placeholderRoles],
      resolved_layers: [...scene.resolvedLayers],
      resolved_assets: scene.resolvedAssets.map((asset) => ({
        role: asset.role,
        reference: asset.reference,
        kind: asset.kind,
        source: asset.source,
        production_ready: false
      })),
      verification: {
        tests: [...scene.verification.tests],
        evidence: [...scene.verification.evidence]
      },
      issues: scene.issues.map((item) => ({ ...item }))
    }))
  };
}

function validStatus(value: unknown): value is CompleteProjectFixtureStatus {
  return value === "complete" || value === "review" || value === "blocked";
}

function validProductionStatus(value: unknown): value is ScenePreflightStatus {
  return value === "ready" || value === "review" || value === "blocked";
}

function validationIssue(code: string, path: string, message: string): CompleteProjectFixtureValidationIssue {
  return { code, path, message };
}

export function validateCompleteProjectFixture(value: unknown): CompleteProjectFixtureValidationIssue[] {
  const issues: CompleteProjectFixtureValidationIssue[] = [];
  if (!isRecord(value)) return [validationIssue("INVALID_MANIFEST", "$", "O manifesto da fixture deve ser um objeto JSON.")];
  if (value.schema !== COMPLETE_PROJECT_FIXTURE_SCHEMA) {
    issues.push(validationIssue("INVALID_SCHEMA", "$.schema", "O manifesto da fixture deve usar schema 1."));
  }
  if (value.registry !== COMPLETE_PROJECT_FIXTURE_REGISTRY) {
    issues.push(validationIssue("INVALID_REGISTRY", "$.registry", "O registro da fixture estrutural é inválido."));
  }
  if (value.mode !== COMPLETE_PROJECT_FIXTURE_MODE) {
    issues.push(validationIssue("INVALID_MODE", "$.mode", "A fixture deve declarar modo structural."));
  }
  if (value.source !== "canonical-template") {
    issues.push(validationIssue("INVALID_SOURCE", "$.source", "A fixture deve indicar o template canônico como fonte."));
  }
  if (value.productionReady !== false) {
    issues.push(validationIssue("PRODUCTION_READY_FORBIDDEN", "$.productionReady", "A fixture estrutural nunca pode ser marcada como pronta para produção."));
  }
  if (!validStatus(value.status)) {
    issues.push(validationIssue("INVALID_STATUS", "$.status", "status deve ser complete, review ou blocked."));
  }
  const sceneCount = value.sceneCount;
  if (typeof sceneCount !== "number" || !Number.isInteger(sceneCount) || sceneCount < 0) {
    issues.push(validationIssue("INVALID_SCENE_COUNT", "$.sceneCount", "sceneCount deve ser um inteiro não negativo."));
  }
  if (!Array.isArray(value.scenes)) {
    issues.push(validationIssue("INVALID_SCENES", "$.scenes", "scenes deve ser uma lista."));
    return issues;
  }
  if (typeof sceneCount === "number" && sceneCount !== value.scenes.length) {
    issues.push(validationIssue("SCENE_COUNT_MISMATCH", "$.sceneCount", "sceneCount deve corresponder à quantidade de cenas."));
  }
  const sceneNames = new Set<string>();
  value.scenes.forEach((scene, index) => {
    const path = `$.scenes[${index}]`;
    if (!isRecord(scene)) {
      issues.push(validationIssue("INVALID_SCENE", path, "Cada item de scenes deve ser um objeto."));
      return;
    }
    for (const key of ["name", "sceneType", "profileId"] as const) {
      if (typeof scene[key] !== "string" || scene[key].trim().length === 0) {
        issues.push(validationIssue("INVALID_SCENE_FIELD", `${path}.${key}`, `${key} deve ser uma string não vazia.`));
      }
    }
    if (typeof scene.name === "string") {
      if (sceneNames.has(scene.name)) issues.push(validationIssue("DUPLICATE_SCENE", `${path}.name`, "A cena aparece mais de uma vez."));
      sceneNames.add(scene.name);
    }
    if (!validProductionStatus(scene.productionStatus)) {
      issues.push(validationIssue("INVALID_PRODUCTION_STATUS", `${path}.productionStatus`, "productionStatus é inválido."));
    }
    if (!validStatus(scene.structuralStatus)) {
      issues.push(validationIssue("INVALID_STRUCTURAL_STATUS", `${path}.structuralStatus`, "structuralStatus é inválido."));
    }
    if (scene.productionReady !== false) {
      issues.push(validationIssue("PRODUCTION_READY_FORBIDDEN", `${path}.productionReady`, "Cenas da fixture nunca são prontas para produção."));
    }
    for (const key of ["placeholderRoles", "resolvedLayers", "resolvedAssets", "issues"] as const) {
      if (!Array.isArray(scene[key])) issues.push(validationIssue("INVALID_SCENE_COLLECTION", `${path}.${key}`, `${key} deve ser uma lista.`));
    }
    if (!isRecord(scene.verification)
      || !Array.isArray(scene.verification.tests)
      || !Array.isArray(scene.verification.evidence)) {
      issues.push(validationIssue("INVALID_VERIFICATION", `${path}.verification`, "verification deve conter testes e evidências."));
    }
    if (Array.isArray(scene.resolvedAssets)) {
      scene.resolvedAssets.forEach((asset, assetIndex) => {
        const assetPath = `${path}.resolvedAssets[${assetIndex}]`;
        if (!isRecord(asset) || typeof asset.reference !== "string" || typeof asset.kind !== "string") {
          issues.push(validationIssue("INVALID_RESOLVED_ASSET", assetPath, "Cada asset resolvido deve declarar reference e kind."));
        }
        if (isRecord(asset) && asset.productionReady !== false) {
          issues.push(validationIssue("PRODUCTION_READY_FORBIDDEN", `${assetPath}.productionReady`, "Assets da fixture nunca são prontos para produção."));
        }
      });
    }
  });
  return issues;
}
