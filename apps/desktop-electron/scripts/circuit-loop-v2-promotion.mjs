import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import approvedBackgrounds from "../fixtures/asset-provenance/runtime-metadata.json" with { type: "json" };

const packagePath = "../fixtures/asset-provenance/circuit-loop-v2/";
const layout = JSON.parse(readFileSync(new URL(`${packagePath}track-layout.json`, import.meta.url), "utf8"));

export const CIRCUIT_LOOP_V2_BACKGROUND = Object.freeze({
  name: "circuit-final-loop-v2-runtime.png",
  sha256: approvedBackgrounds["circuit-final-loop-v2-runtime.png"].preparedSha256
});

export async function syncApprovedCircuitLoopV2Asset(projectPath) {
  const preparedPath = fileURLToPath(new URL(
    `../../../tools/gba-sprite-prep/production/play-background-fidelity-v1-approved/prepared/${CIRCUIT_LOOP_V2_BACKGROUND.name}`, import.meta.url
  ));
  const bytes = await readFile(preparedPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== CIRCUIT_LOOP_V2_BACKGROUND.sha256) {
    throw new Error("Hash do background preparado do Circuito Final V2 divergente");
  }
  const target = path.join(path.dirname(projectPath), "Assets", "backgrounds", CIRCUIT_LOOP_V2_BACKGROUND.name);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(preparedPath, target);
  return { target, sha256 };
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

export function circuitLoopV2CollisionTypes() {
  const { width, height } = layout.worldPixels;
  const columns = width / layout.tileSizePixels;
  const rows = height / layout.tileSizePixels;
  return Array.from({ length: columns * rows }, (_, index) => {
    const x = (index % columns) * layout.tileSizePixels + layout.tileSizePixels / 2;
    const y = Math.floor(index / columns) * layout.tileSizePixels + layout.tileSizePixels / 2;
    return layout.centerline.some((point, pathIndex) =>
      distanceToSegment(x, y, point, layout.centerline[(pathIndex + 1) % layout.centerline.length])
        <= layout.roadHalfWidthPixels) ? "free" : "solid";
  });
}

function compressRle(values) {
  const runs = [];
  for (const value of values) {
    const last = runs.at(-1);
    if (last && last[0] === value) last[1] += 1;
    else runs.push([value, 1]);
  }
  return { encoding: "rle-v1", length: values.length, runs };
}

function racingBackgroundAsset(existing) {
  return {
    ...existing,
    name: CIRCUIT_LOOP_V2_BACKGROUND.name,
    metadata: {
      ...existing.metadata,
      source: `Assets/backgrounds/${CIRCUIT_LOOP_V2_BACKGROUND.name}`,
      sourceCandidate: "tools/gba-sprite-prep/production/circuito-final-loop-v2-candidate/source/circuito-final-loop-v2-road-readability-source.png",
      provenance: "tools/gba-sprite-prep/production/circuito-final-loop-v2-candidate/SOURCES.md",
      generatedBy: "circuito-final-loop-v2-candidate",
      preparedSha256: CIRCUIT_LOOP_V2_BACKGROUND.sha256,
      backgroundTileOptimizer: { enabled: true, tileBudget: 895, maxFramebufferMismatchRatio: 0 },
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 480,
      height: 320,
      tileCount: 2400,
      optimizedTileCount: 895,
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "approved",
      visualStatus: "attention",
      candidateStatus: "approved-composition",
      sourcePreserving: false,
      technicalNote: "Composição aprovada; imagem de runtime derivada por assetc ainda requer revisão visual integrada.",
      ...approvedBackgrounds[CIRCUIT_LOOP_V2_BACKGROUND.name]
    }
  };
}

export function promoteApprovedCircuitLoopV2(project) {
  const room = project.rooms?.find((item) => item.name === "circuito_final");
  if (!room) return project;
  if (room.runtime?.type !== "racing" || room.width !== 60 || room.height !== 40) {
    throw new Error("circuito_final racing 60×40 ausente");
  }
  const backgroundIndex = project.assets?.findIndex((asset) => asset.id === "racing-topdown-background");
  if (backgroundIndex < 0) throw new Error("Asset racing-topdown-background ausente");
  const collisions = compressRle(circuitLoopV2CollisionTypes());
  const player = layout.actors.find((actor) => actor.role === "player");
  if (!player) throw new Error("Player da largada ausente do layout aprovado");
  const actorById = new Map(layout.actors.map((actor) => [actor.id, actor]));
  for (const actorId of ["racing-nara", "racing-rival", "racing-rival-2"]) {
    if (!project.actors.some((actor) => actor.id === actorId) || !actorById.has(actorId)) {
      throw new Error(`Ator da corrida ausente: ${actorId}`);
    }
  }
  const nextRoom = {
    ...room,
    backgroundAssetName: CIRCUIT_LOOP_V2_BACKGROUND.name,
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    collisions,
    collisionTypes: structuredClone(collisions),
    runtime: {
      ...room.runtime,
      config: {
        ...room.runtime.config,
        rivalSpeed: 105,
        topdownTrack: {
          cameraDeadZoneX: layout.cameraDeadZone.x,
          cameraDeadZoneY: layout.cameraDeadZone.y,
          startHeading: layout.startHeading,
          pathPoints: layout.centerline.map(([x, y]) => ({ x, y })),
          checkpoints: structuredClone(layout.checkpoints)
        }
      }
    }
  };
  const assets = [...project.assets];
  assets[backgroundIndex] = racingBackgroundAsset(assets[backgroundIndex]);
  const actors = project.actors.map((actor) => {
    const placement = actorById.get(actor.id);
    return placement ? { ...actor, x: Math.floor(placement.x / 8), y: Math.floor(placement.y / 8) } : actor;
  });
  const events = project.events.map((event) => event.name === "circuito_reiniciar"
    ? { ...event, steps: event.steps.map((step) => step.command?.startsWith("change_scene circuito_final ")
      ? { ...step, command: `change_scene circuito_final ${Math.floor(player.x / 8)} ${Math.floor(player.y / 8)} right` }
      : step) }
    : event);
  return {
    ...project,
    assets,
    actors,
    events,
    rooms: project.rooms.map((item) => item.name === "circuito_final" ? nextRoom : item),
    scenas: project.scenas.map((item) => item.name === "circuito_final" ? structuredClone(nextRoom) : item)
  };
}
