import catalog from "../../default-assets/templates/blank/dungeon-defaults.json" with { type: "json" };
import type { GBAProjectData } from "./projectFile.js";

export function blankDungeonMaterialContent(): Record<string, unknown>[] {
  return catalog.materials.map(material => ({
    id: `asset-${material.name.replace(".png", "")}`, name: material.name, kind: "Background", systemImage: "photo",
    metadata: {
      source: material.file, bundledDefaultAsset: `template:blank/${material.file}`,
      width: 64, height: 64, tileWidth: 8, tileHeight: 8, colorMode: "4bpp",
      visualProfile: catalog.profile, dungeonMaterial: true, license: "Project-owned",
      provenance: "Original OpenAI Imagegen artwork; prepared v2 visually approved by the user on 2026-10-19.",
      sourceSha256: catalog.sourceSha256, preparedSha256: material.sha256
    }
  }));
}

/** Only a selected default background opts a newly authored room into these materials. */
export function blankDungeonMaterials(data: GBAProjectData, room: Record<string, unknown>): string[] | undefined {
  const assets = Array.isArray(data.assets) ? data.assets as Record<string, any>[] : [];
  const background = assets.find(asset => asset.name === room.backgroundAssetName);
  return background?.metadata?.dungeonMaterialAssets?.slice();
}

export const BLANK_DUNGEON_MATERIALS = catalog.materialAssets;

/** Frontal NPCs are separate from the optional first-person player hand. */
export function blankDungeonNpcContent() {
  const assets: Record<string, unknown>[] = [];
  const animations: Record<string, unknown>[] = [];
  const animationStates: Record<string, unknown>[] = [];
  for (const depth of catalog.npc.depths) {
    const id = `neutral-dungeon-guard-${depth.depth}`;
    assets.push({
      id: `asset-${id}`, name: depth.name, kind: "Sprite", systemImage: "figure.walk",
      metadata: {
        source: depth.file, bundledDefaultAsset: `template:blank/${depth.file}`,
        width: depth.width, height: depth.height, colorMode: "4bpp", streamFrames: true,
        visualProfile: catalog.npc.profile, license: catalog.npc.license,
        provenance: "Original OpenAI Imagegen artwork; frontal guard and depth scales visually approved on 2026-10-19.",
        sourceSha256: catalog.npc.sourceSha256, preparedSha256: depth.sha256
      }
    });
    animations.push({
      id: `animation-${id}`, name: "idle", spriteSheet: depth.name,
      state: "idle", direction: "none", fps: 1, loops: true, frameCount: 1,
      frameWidth: depth.width, frameHeight: depth.height, colorMode: "4bpp", originX: 0, originY: 0,
      frames: [{
        frameIndex: 0, sourceFrameIndex: 0, width: depth.width, height: depth.height, originX: 0, originY: 0,
        tiles: Array.from({ length: Math.ceil(depth.height / 64) }, (_, part) => ({
          x: -depth.footPivotX,
          // Animator y counts up from the foot anchor; split only at native OBJ boundaries.
          y: 8 + depth.footPivotY - part * 64 - Math.min(64, depth.height - part * 64),
          sliceX: 0, sliceY: part * 64, sourceSheet: depth.name,
          tileWidth: depth.width, tileHeight: Math.min(64, depth.height - part * 64),
          flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false
        }))
      }]
    });
    animationStates.push({
      id: `state-${id}`, name: `dungeon-guard-${depth.depth}`, spriteSheet: depth.name,
      animationType: "fixed", mirrorLeftFromRight: false, animationIDs: [`animation-${id}`]
    });
  }
  return { assets, animations, animationStates };
}

/** Older projects and explicit sprite choices keep their existing library and behavior. */
export function blankDungeonNpcDefaults(data: GBAProjectData) {
  const assets = Array.isArray(data.assets) ? data.assets as Record<string, unknown>[] : [];
  if (!catalog.npc.depths.every(depth => assets.some(asset => asset.name === depth.name))) return undefined;
  return {
    spriteSheet: catalog.npc.depths.find(depth => depth.depth === "near")!.name,
    dungeonDepthSheets: Object.fromEntries(catalog.npc.depths.map(depth => [depth.depth, depth.name])),
    dungeonDepthAnimationName: "idle"
  };
}

/** The representative BG and a new default room must describe the same maze. */
export function blankDungeonInitialLayout(width:number,height:number) {
  const layout=catalog.initialLayout;
  return width===layout.width&&height===layout.height ? {
    collisionTypes:layout.rows.flatMap(row=>Array.from(row,cell=>cell==="#"?"solid":"free")),
    playerStart:{...layout.playerStart},door:{...layout.door}
  } : undefined;
}
