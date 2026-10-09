import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const APPROVED_SCENE_REFRESH_NAMES = Object.freeze([
  "abertura",
  "titulo",
  "tempestade"
]);

export const APPROVED_SCENE_REFRESH_MANIFEST_PATH = path.join(
  repositoryRoot,
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-scene-refresh-v2-approved",
  "approved-scene-refresh-v2.json"
);

function replaceByKey(records, replacements, key) {
  const replacementByKey = new Map(replacements.map((record) => [record[key], record]));
  const applied = new Set();
  const result = [];
  for (const record of records) {
    const recordKey = record?.[key];
    const replacement = replacementByKey.get(recordKey);
    if (replacement) {
      result.push(structuredClone(replacement));
      applied.add(recordKey);
    } else {
      result.push(record);
    }
  }
  for (const replacement of replacements) {
    if (!applied.has(replacement[key])) result.push(structuredClone(replacement));
  }
  return result;
}

function reorderScenes(records, replacements, key, preferredOrder) {
  const byKey = new Map(records.map((record) => [record?.[key], record]));
  for (const replacement of replacements) byKey.set(replacement[key], structuredClone(replacement));
  const result = [];
  const emitted = new Set();
  for (const recordKey of preferredOrder) {
    const record = byKey.get(recordKey);
    if (!record || emitted.has(recordKey)) continue;
    result.push(record);
    emitted.add(recordKey);
  }
  for (const record of records) {
    if (emitted.has(record?.[key])) continue;
    result.push(record);
    emitted.add(record?.[key]);
  }
  for (const replacement of replacements) {
    if (emitted.has(replacement[key])) continue;
    result.push(structuredClone(replacement));
    emitted.add(replacement[key]);
  }
  return result;
}

export function promoteApprovedSceneRefresh(project, manifest) {
  if (!project || typeof project !== "object") throw new TypeError("Projeto inválido para promoção.");
  if (!manifest || typeof manifest !== "object") throw new TypeError("Manifesto inválido para promoção.");

  const sceneNames = new Set(manifest.sceneNames ?? APPROVED_SCENE_REFRESH_NAMES);
  const targetScenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const preferredSceneOrder = Array.isArray(manifest.sceneOrder) ? manifest.sceneOrder : null;
  const targetActors = Array.isArray(manifest.actors) ? manifest.actors : [];
  const targetAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const targetAnimations = Array.isArray(manifest.animations) ? manifest.animations : [];
  const targetAnimationStates = Array.isArray(manifest.animationStates) ? manifest.animationStates : [];
  const targetSpriteSheets = new Set(targetActors.map((actor) => actor?.spriteSheet).filter(Boolean));
  const targetAnimationIds = new Set(targetAnimations.map((animation) => animation?.id).filter(Boolean));
  const targetAnimationStateIds = new Set(targetAnimationStates.map((state) => state?.id).filter(Boolean));
  const next = structuredClone(project);

  for (const key of ["rooms", "scenas"]) {
    if (!Array.isArray(next[key])) continue;
    next[key] = preferredSceneOrder
      ? reorderScenes(next[key], targetScenes, "name", preferredSceneOrder)
      : replaceByKey(next[key], targetScenes, "name");
  }

  next.actors = [
    ...(Array.isArray(next.actors) ? next.actors.filter((actor) => !sceneNames.has(actor?.roomName)) : []),
    ...structuredClone(targetActors)
  ];

  next.assets = replaceByKey(Array.isArray(next.assets) ? next.assets : [], targetAssets, "name");
  next.animations = [
    ...(Array.isArray(next.animations)
      ? next.animations.filter((animation) => (
        !targetSpriteSheets.has(animation?.spriteSheet) && !targetAnimationIds.has(animation?.id)
      ))
      : []),
    ...structuredClone(targetAnimations)
  ];
  next.animationStates = [
    ...(Array.isArray(next.animationStates)
      ? next.animationStates.filter((state) => (
        !targetSpriteSheets.has(state?.spriteSheet) && !targetAnimationStateIds.has(state?.id)
      ))
      : []),
    ...structuredClone(targetAnimationStates)
  ];

  const shmup = next.settings?.shmup && typeof next.settings.shmup === "object"
    ? next.settings.shmup
    : {};
  next.settings = {
    ...(next.settings ?? {}),
    shmup: {
      ...shmup,
      playerSprite: "tempestade-v3-player.png",
      enemySprite: "tempestade-v3-drone-horizontal.png"
    }
  };
  return next;
}

export async function readApprovedSceneRefreshManifest(manifestPath = APPROVED_SCENE_REFRESH_MANIFEST_PATH) {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export async function promoteApprovedSceneRefreshFiles({
  templateProjectPath,
  fixtureProjectPath,
  manifestPath = APPROVED_SCENE_REFRESH_MANIFEST_PATH
}) {
  const manifest = await readApprovedSceneRefreshManifest(manifestPath);
  const [template, fixture] = await Promise.all([
    readFile(templateProjectPath, "utf8"),
    readFile(fixtureProjectPath, "utf8")
  ]);
  const templateProject = promoteApprovedSceneRefresh(JSON.parse(template), manifest);
  const fixtureProject = promoteApprovedSceneRefresh(JSON.parse(fixture), manifest);
  await Promise.all([
    writeFile(templateProjectPath, `${JSON.stringify(templateProject, null, 2)}\n`, "utf8"),
    writeFile(fixtureProjectPath, `${JSON.stringify(fixtureProject, null, 2)}\n`, "utf8")
  ]);
  return {
    manifest,
    templateProject,
    fixtureProject
  };
}
